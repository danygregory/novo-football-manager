import { useEffect, useState } from 'react';
import { STAGE_LABEL, userFixture, type Cut, type Fixture, type MatchRecord, type Tournament } from '../engine/tournament';
import { finalizeDraft, startDraft, type DraftConfig, type DraftState } from '../data/draft';
import { squadOf } from '../data/squads';
import type { Lineup, MatchReport } from '../engine/types';
import { applyCup, careerCut, newCareer, reputationDelta, takeTeam, type Career, type CupEvaluation } from '../engine/career';
import { Kit } from './components/common';
import { ShareBar } from './components/ShareBar';
import { ChallengeIntro } from './screens/ChallengeIntro';
import { baseUrl, encodeChallenge, parseChallenge, type Challenge } from '../share/link';
import { cupShare, scenarioShare } from '../share/result';
import { SCENARIOS, scenarioById, scenarioResult, type Scenario, type ScenarioResult } from '../engine/scenarios';
import { autoLineup, autoSquad23, tacticsForStyle } from '../engine/lineup';
import { ScenarioList, ScenarioOutcome } from './screens/Scenarios';
import { repo, todayIso } from './store';
import { applyImport, exportSave, parseSave, type Run, type Settings } from '../save';
import { syncNames } from './names';
import { DEFAULT_SPEED, type Speed } from './speed';
import { engine } from './engineClient';
import { Cup } from './screens/Cup';
import { CupEnd } from './screens/CupEnd';
import { Achievements } from './screens/Achievements';
import { DailyIntro } from './screens/Daily';
import { bestOfDay, dailyCut, dailySeed, dailyTeam, shareText, type DailyRecord } from '../engine/daily';
import { ScoreCard } from './screens/ScoreCard';
import { addToRanking, newAchievements, rankingEntry, summarizeCup, type Achievement, type CupSummary } from '../engine/scoring';
import { CareerAfterCup, CareerChoose, CareerHome } from './screens/Career';
import { CupSetup } from './screens/CupSetup';
import { DraftBoard } from './screens/DraftBoard';
import { DraftSetup } from './screens/DraftSetup';
import { Home } from './screens/Home';
import { LiveMatch, type LiveStart } from './screens/LiveMatch';
import { MatchIntro } from './screens/Match';
import { PickNation } from './screens/PickNation';
import { PostMatch } from './screens/PostMatch';
import { PenaltyDemo } from './screens/PenaltyDemo';
import { Squad } from './screens/Squad';
import { Tactics } from './screens/Tactics';
import { eraSpan, nationLabel, nationsById, registerCustom, world } from './world';

type Screen = 'home' | 'achievements' | 'challengeIntro' | 'scenarios' | 'scenarioEnd' | 'dailyIntro' | 'careerStart' | 'careerHome' | 'pick' | 'squad' | 'draftSetup' | 'draft' | 'tactics' | 'cupSetup' | 'cup' | 'match' | 'live' | 'post' | 'end';

interface Game {
  screen: Screen;
  /** Seleção pronta ou time montado no draft. */
  mode?: 'ready' | 'draft' | 'career' | 'daily' | 'scenario';
  scenario?: Scenario;
  /** Link de cenário de amigo: mostra só esse cenário, com os pontos dele. */
  scenarioFriend?: { id: string; points?: number };
  scenarioOutcome?: { res: ScenarioResult; best: number; improved: boolean };
  /** Link de desafio aberto: a Copa do amigo (seleção, recorte e seed). */
  challenge?: Extract<Challenge, { kind: 'cup' }>;
  /** Data (aaaa-mm-dd) do desafio do dia em andamento. */
  dailyDate?: string;
  career?: Career;
  careerApplied?: boolean;
  /** Pontuação e conquistas da Copa que acabou de terminar (calculadas uma vez). */
  scored?: { summary: CupSummary; achievements: Achievement[]; daily?: DailyRecord };
  careerResult?: { delta: number; ev: CupEvaluation };
  draftConfig?: DraftConfig;
  draft?: DraftState;
  cut: Cut;
  nationId?: string;
  called: string[];
  lineup?: Lineup;
  tournament?: Tournament;
  last?: { report: MatchReport; fixture: Fixture };
  live?: { start: LiveStart; speed: Speed };
}

/** Ordem dos cenários oferecidos no botão principal: os de gancho mais fácil de entender primeiro. */
const QUICK_ORDER = ['brasil-contra-brasil', 'maracanazo', 'davi-golias', 'milagre-berna', 'laranja', 'tiki-taka', 'final-moderna', 'caiu-no-grupo'];

const FRESH: Game = { screen: 'home', called: [], cut: 'all' };

function loadSettings() {
  return repo.load('settings') ?? {};
}

export function App() {
  // página de depuração da cena de pênalti: só existe no servidor de desenvolvimento (fora do build de produção)
  if (import.meta.env.DEV && typeof location !== 'undefined' && location.hash === '#penalty-demo') return <PenaltyDemo />;
  return <MainApp />;
}

function MainApp() {
  const [g, setG] = useState<Game>(FRESH);
  const [settings, setSettings] = useState(loadSettings);
  const systemReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const reduced = settings.reduceMotion ?? systemReduced;
  const saveSettings = (next: Settings) => {
    setSettings(next);
    repo.save('settings', next);
  };
  const toggleReduced = () => saveSettings({ ...settings, reduceMotion: !reduced });
  const lastSpeed: Speed = settings.speed ?? DEFAULT_SPEED;
  const rememberSpeed = (s: Speed) => {
    if (s !== settings.speed) saveSettings({ ...settings, speed: s });
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [homeMsg, setHomeMsg] = useState<{ ok: boolean; text: string }>();
  /** Copa ou cenário salvo (lido de novo a cada volta à tela inicial). */
  const [savedRun, setSavedRun] = useState<Run | undefined>(() => repo.load('run'));

  const go = (patch: Partial<Game>) => setG((prev) => ({ ...prev, ...patch }));

  const guarded = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Só existe um slot de partida em andamento ('run'): antes de substituí-lo por uma Copa ou cenário novo, avisa o que será perdido. */
  const confirmReplaceRun = () =>
    !runInfo || confirm(`Você tem uma partida em andamento: ${runInfo.label} (${runInfo.stage}). Começar outra vai descartá-la. Continuar?`);

  const startCup = (lineup: Lineup, cut: Cut, fixedSeed?: number) => {
    if (!confirmReplaceRun()) return Promise.resolve();
    return guarded(async () => {
      const seed = fixedSeed ?? Math.floor(Math.random() * 2 ** 32);
      const custom = g.mode === 'draft' ? nationsById.get(g.nationId as string) : undefined;
      const tournament = await engine.call('createTournament', { nationId: g.nationId as string, squad: g.called, lineup, seed, cut, custom: custom?.custom ? custom : undefined });
      setG((prev) => ({ ...prev, lineup, cut, tournament, screen: 'cup', last: undefined, scored: undefined }));
    });
  };

  /** Cenário: elenco e escalação já definidos (ou automáticos) -> cria a partida e vai à apresentação do jogo. */
  const startScenario = (sc: Scenario, called: string[], lineup: Lineup) => {
    if (!confirmReplaceRun()) return Promise.resolve();
    return guarded(async () => {
      registerCustom(undefined);
      const tournament = await engine.call('createScenario', { scenarioId: sc.id, squad: called, lineup });
      setG((prev) => ({ ...prev, mode: 'scenario', scenario: sc, nationId: sc.user, called, lineup, tournament, scenarioOutcome: undefined, scored: undefined, last: undefined, screen: 'match' }));
    });
  };

  const playScenarioNow = (sc: Scenario) => {
    const nation = nationsById.get(sc.user);
    if (!nation) return;
    const squad = autoSquad23(squadOf(nation));
    void startScenario(sc, squad.map((p) => p.id), autoLineup(nation.id, squad, tacticsForStyle(nation.playStyle)));
  };

  const resetAll = () => {
    registerCustom(undefined);
    setG(FRESH);
  };

  const startNewDraft = (cfg: Omit<DraftConfig, 'seed'>) => {
    const config: DraftConfig = { ...cfg, seed: Math.floor(Math.random() * 2 ** 31) };
    registerCustom(undefined);
    setG((prev) => ({ ...prev, mode: 'draft', draftConfig: config, draft: startDraft(world, config), nationId: undefined, called: [], lineup: undefined, screen: 'draft' }));
  };

  const finishDraft = () => {
    const state = g.draft as DraftState;
    const team = finalizeDraft(state);
    registerCustom(team);
    setG((prev) => ({ ...prev, nationId: team.id, called: squadOf(team).map((p) => p.id), lineup: undefined, screen: 'tactics' }));
  };

  const playInstant = () =>
    guarded(async () => {
      const t = g.tournament as Tournament;
      const { report, fixture, record } = await engine.call('instantUserMatch', { tournament: t });
      const { tournament } = await engine.call('playRound', { tournament: t, userReport: report, record });
      setG((prev) => ({ ...prev, tournament, last: { report, fixture }, screen: 'post' }));
    });

  const startLive = (speed: Speed) =>
    guarded(async () => {
      rememberSpeed(speed);
      const start = await engine.call('matchStart', { tournament: g.tournament as Tournament });
      setG((prev) => ({ ...prev, live: { start, speed }, screen: 'live' }));
    });

  /** Fecha a rodada com o relatório da partida assistida e vai para o pós-jogo. */
  const finishLive = (report: MatchReport, record: MatchRecord) =>
    guarded(async () => {
      const t0 = g.tournament as Tournament;
      const fixture = g.live?.start.fixture as Fixture;
      const { tournament } = await engine.call('playRound', { tournament: t0, userReport: report, record });
      setG((prev) => ({ ...prev, tournament, last: { report, fixture }, live: undefined, screen: 'post' }));
    });

  /** Sair da visualização: o resto da partida é simulado de uma vez e o jogo segue para o pós-jogo. */
  const exitLive = () =>
    guarded(async () => {
      const t0 = g.tournament as Tournament;
      const fixture = g.live?.start.fixture as Fixture;
      const { report, record } = await engine.call('matchFinish', {});
      if (!report || !record) throw new Error('A partida não gerou relatório.');
      const { tournament } = await engine.call('playRound', { tournament: t0, userReport: report, record });
      setG((prev) => ({ ...prev, tournament, last: { report, fixture }, live: undefined, screen: 'post' }));
    });

  const simulateRest = () =>
    guarded(async () => {
      const tournament = await engine.call('playRemaining', { tournament: g.tournament as Tournament });
      setG((prev) => ({ ...prev, tournament, screen: 'end' }));
    });

  // ao terminar a Copa: pontuação, conquistas, ranking local e (na carreira) reputação, histórico e convites, uma vez por Copa
  useEffect(() => {
    if ((g.screen !== 'end' && g.screen !== 'scenarioEnd') || !g.tournament || g.scored || g.scenarioOutcome) return;
    const t0 = g.tournament;
    if (t0.scenario) {
      const res = scenarioResult(world, t0);
      if (!res) return;
      const all = repo.load('scenarios') ?? {};
      const prevBest = all[t0.scenario.id]?.points;
      const improved = prevBest === undefined || res.points > prevBest;
      if (improved) repo.save('scenarios', { ...all, [t0.scenario.id]: { points: res.points, text: res.text, date: todayIso() } });
      setG((prev) => ({ ...prev, scenarioOutcome: { res, best: improved ? res.points : (prevBest as number), improved } }));
      return;
    }
    const summary = summarizeCup(world, t0);
    let career = g.career;
    let careerResult = g.careerResult;
    if (g.mode === 'career' && career && !g.careerApplied) {
      career = applyCup(world, career, t0, summary.ev, summary.total);
      repo.save('career', career);
      careerResult = { delta: reputationDelta(summary.ev), ev: summary.ev };
    }
    const stats = repo.load('stats') ?? { cups: 0 };
    const already = new Set(Object.keys(repo.load('achievements') ?? {}));
    const achievements = newAchievements(
      summary,
      { daily: g.mode === 'daily', careerTitles: career?.entries.filter((e) => e.champion).length, careerRep: g.mode === 'career' ? career?.rep : undefined, previousCups: stats.cups },
      already,
    );
    const date = todayIso();
    if (achievements.length) repo.save('achievements', { ...repo.load('achievements'), ...Object.fromEntries(achievements.map((a) => [a.id, date])) });
    const team = nationsById.get(t0.userNationId)?.country ?? t0.userNationId;
    repo.save('ranking', addToRanking(repo.load('ranking') ?? [], rankingEntry(summary, (g.mode === 'scenario' ? 'ready' : g.mode) ?? 'ready', team, date)));
    repo.save('stats', { cups: stats.cups + 1 });
    let dailyRecord: DailyRecord | undefined;
    if (g.mode === 'daily' && g.dailyDate) {
      const dayTeam = dailyTeam(world, g.dailyDate);
      const text = shareText(g.dailyDate, dayTeam, summary, `${dayTeam.country} ${eraSpan(dayTeam)}`);
      const all = repo.load('daily') ?? {};
      dailyRecord = bestOfDay(all[g.dailyDate], { date: g.dailyDate, points: summary.total, stageText: summary.stageText, champion: summary.ev.champion, text });
      // o texto compartilhado mostra a campanha desta partida; o melhor do dia fica salvo
      repo.save('daily', { ...all, [g.dailyDate]: dailyRecord });
      dailyRecord = { date: g.dailyDate, points: summary.total, stageText: summary.stageText, champion: summary.ev.champion, text };
    }
    setG((prev) => ({ ...prev, career, careerApplied: prev.mode === 'career' ? true : prev.careerApplied, careerResult, scored: { summary, achievements, daily: dailyRecord } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.screen]);

  const persistCareer = (career: Career) => {
    repo.save('career', career);
    return career;
  };

  const openCareer = () => {
    registerCustom(undefined);
    let career = repo.load('career');
    if (!career || !Array.isArray(career.entries)) career = persistCareer(newCareer(world, Math.floor(Math.random() * 2 ** 31)));
    const screen: Screen = career.startOptions?.length && !career.nationId ? 'careerStart' : 'careerHome';
    setG((prev) => ({ ...FRESH, mode: 'career', career, screen, cut: prev.cut }));
  };

  // Copa ou cenário em andamento: salva a cada mudança de rodada (não no meio da partida: ela recomeça do apito, com a mesma seed)
  useEffect(() => {
    const tt = g.tournament;
    if (!tt || !g.mode) return;
    if (g.scored || g.scenarioOutcome) {
      // o resultado já virou pontos, ranking e conquistas: a Copa salva não serve mais
      repo.remove('run');
      setSavedRun(undefined);
      return;
    }
    const mode = g.mode;
    const r: Run = {
      v: 1,
      savedAt: new Date().toISOString(),
      mode,
      tournament: tt,
      ...(g.dailyDate ? { dailyDate: g.dailyDate } : {}),
      ...(g.scenario ? { scenarioId: g.scenario.id } : {}),
      ...(g.challenge ? { challenge: { nationId: g.challenge.nationId, cut: g.challenge.cut, seed: g.challenge.seed, points: g.challenge.points, stage: g.challenge.stage } } : {}),
    };
    repo.save('run', r);
    setSavedRun(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.tournament, g.scored, g.scenarioOutcome]);

  const resumeRun = (r: Run) => {
    const tt = r.tournament;
    registerCustom(tt.custom);
    const scenario = r.scenarioId ? scenarioById(r.scenarioId) : undefined;
    const challenge = r.challenge ? ({ kind: 'cup', ...r.challenge } as Extract<Challenge, { kind: 'cup' }>) : undefined;
    const screen: Screen = tt.stage === 'DONE' ? (tt.scenario ? 'scenarioEnd' : 'end') : tt.scenario ? 'match' : 'cup';
    setG({
      ...FRESH,
      mode: r.mode,
      tournament: tt,
      nationId: tt.userNationId,
      called: tt.squads[tt.userNationId] ?? [],
      lineup: tt.userLineup,
      cut: tt.cut,
      dailyDate: r.dailyDate,
      scenario,
      challenge,
      career: r.mode === 'career' ? repo.load('career') : undefined,
      screen,
    });
  };

  const exportAll = () => {
    const blob = new Blob([exportSave(repo)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `novo-fm-save-${todayIso()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setHomeMsg({ ok: true, text: 'Save exportado. Guarde o arquivo: ele leva toda a sua carreira, conquistas e a Copa em andamento.' });
  };

  const importFile = async (file: File) => {
    if (file.size > 2_000_000) return setHomeMsg({ ok: false, text: 'Arquivo grande demais para ser um save do jogo.' });
    const parsed = parseSave(await file.text(), (nid) => nationsById.has(nid));
    if (!parsed.ok) return setHomeMsg({ ok: false, text: parsed.error });
    if (!confirm('Importar este save substitui todo o progresso guardado neste navegador (carreira, conquistas, ranking, Copa em andamento). Continuar?')) return;
    applyImport(repo, parsed.data);
    syncNames();
    setSavedRun(repo.load('run'));
    setHomeMsg({ ok: true, text: 'Save importado.' });
  };

  /** Botão principal da tela inicial: o primeiro cenário ainda não jogado (na ordem de gancho); depois, um sorteado. */
  const [quickSeed] = useState(() => Math.random());
  const quick = (() => {
    const done = repo.load('scenarios') ?? {};
    const order = QUICK_ORDER.map((id) => scenarioById(id)).filter((s): s is Scenario => !!s);
    const sc = order.find((s) => !done[s.id]) ?? SCENARIOS[Math.floor(quickSeed * SCENARIOS.length)];
    const me = sc && nationsById.get(sc.user);
    const opp = sc && nationsById.get(sc.opponent);
    if (!sc || !me || !opp) return undefined;
    return { title: sc.title, blurb: `${nationLabel(me)} contra ${nationLabel(opp)}`, first: Object.keys(done).length === 0, onPlay: () => playScenarioNow(sc) };
  })();

  const runInfo = savedRun
    ? (() => {
        const tt = savedRun.tournament;
        const n = nationsById.get(tt.userNationId) ?? tt.custom;
        const sc = savedRun.scenarioId ? scenarioById(savedRun.scenarioId) : undefined;
        return {
          label: sc ? `${sc.title}` : n ? nationLabel(n) : tt.userNationId,
          stage: sc ? 'Cenário' : STAGE_LABEL[tt.stage],
          savedAt: new Date(savedRun.savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
        };
      })()
    : undefined;

  // link de desafio no endereço (#c=...): abre a tela do desafio e limpa o hash para não reabrir ao recarregar
  useEffect(() => {
    const open = () => {
      if (!location.hash.startsWith('#c=')) return;
      const c = parseChallenge(location.hash, { nation: (id) => nationsById.has(id), scenario: (id) => !!scenarioById(id) });
      history.replaceState(null, '', location.pathname + location.search);
      if (!c) return;
      registerCustom(undefined);
      if (c.kind === 'cup') setG({ ...FRESH, mode: 'ready', challenge: c, nationId: c.nationId, cut: c.cut, screen: 'challengeIntro' });
      else if (c.kind === 'scenario') setG({ ...FRESH, mode: 'scenario', scenarioFriend: { id: c.id, points: c.points }, screen: 'scenarios' });
      else if (c.kind === 'daily' && c.date <= todayIso()) setG({ ...FRESH, mode: 'daily', dailyDate: c.date, screen: 'dailyIntro' });
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);

  /** Barra de compartilhar do fim da Copa: texto, imagem e (menos no draft) o link para o amigo jogar a mesma Copa. */
  const endShare = (summary: CupSummary, daily?: DailyRecord) => {
    const tt = g.tournament as Tournament;
    const nation = nationsById.get(tt.userNationId);
    if (!nation) return null;
    const url = baseUrl();
    let challenge: Challenge | undefined;
    let mode = 'Copa';
    if (g.mode === 'daily' && g.dailyDate) {
      challenge = { kind: 'daily', date: g.dailyDate };
      mode = `Desafio do dia · ${g.dailyDate}`;
    } else if (!nation.custom) {
      challenge = { kind: 'cup', nationId: nation.id, cut: tt.cut, seed: tt.seed, points: summary.total, stage: summary.stageText };
      mode = g.mode === 'career' ? 'Carreira' : 'Copa';
    }
    const link = challenge ? url + encodeChallenge(challenge) : undefined;
    const r = cupShare({ summary, team: nation.country, era: eraSpan(nation), colors: nation.colors, mode, link, url });
    const text = daily && link ? `${daily.text}\n${link}` : r.text;
    const vs = g.challenge?.points;
    return (
      <>
        {vs !== undefined && (
          <div className="panel" style={{ textAlign: 'left', margin: '14px 0' }}>
            <b>{summary.total > vs ? '🏆 Você superou o desafio!' : summary.total === vs ? 'Empate no desafio.' : 'O desafio ainda é do seu amigo.'}</b>{' '}
            <span className="muted">Você: {summary.total} pts · Amigo: {vs} pts</span>
          </div>
        )}
        <ShareBar text={text} card={r.card} filename={`novo-fm-${nation.id}.png`} />
      </>
    );
  };

  /** Fim de um cenário: resultado, pontos, compartilhar e tentar de novo. */
  const scenarioEnd = (sc: Scenario, o: { res: ScenarioResult; best: number; improved: boolean }) => {
    const me = nationsById.get(sc.user);
    const opp = nationsById.get(sc.opponent);
    if (!me || !opp) return null;
    const url = baseUrl();
    const link = url + encodeChallenge({ kind: 'scenario', id: sc.id, points: o.res.points });
    const r = scenarioShare({ title: sc.title, team: me.country, era: eraSpan(me), opponent: `${opp.country} ${eraSpan(opp)}`, colors: me.colors, resultText: o.res.text, won: o.res.result === 'W', score: `${o.res.score[0]}–${o.res.score[1]}`, points: o.res.points, link, url });
    const next = SCENARIOS[(SCENARIOS.findIndex((x) => x.id === sc.id) + 1) % SCENARIOS.length] as Scenario;
    return (
      <>
        <ScenarioOutcome sc={sc} res={o.res} best={o.best} improved={o.improved} />
        <ShareBar text={r.text} card={r.card} filename={`novo-fm-${sc.id}.png`} />
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={() => playScenarioNow(sc)}>Tentar de novo (elenco automático)</button>
          <button onClick={() => go({ mode: 'scenario', scenario: sc, nationId: sc.user, called: [], lineup: undefined, tournament: undefined, scenarioOutcome: undefined, screen: 'squad' })}>Escalar de outro jeito</button>
          <button onClick={() => playScenarioNow(next)}>Próximo: {next.title}</button>
          <button onClick={() => setG({ ...FRESH, mode: 'scenario', screen: 'scenarios' })}>Todos os cenários</button>
        </div>
      </>
    );
  };

  const t = g.tournament;
  const user = g.nationId ? nationsById.get(g.nationId) : undefined;

  return (
    <div className={`app ${reduced ? 'reduced' : ''}`}>
      <header className="topbar">
        <div className="brand">NOVO <span>FM</span></div>
        <div className="crumbs">
          {user && (
            <>
              <Kit nation={user} />
              <b>{nationLabel(user)}</b>
              {t && <> · {t.scenario && t.stage === 'DONE' ? 'Cenário encerrado' : STAGE_LABEL[t.stage]}</>}
            </>
          )}
        </div>
        <label className="muted toggle" title="Desliga câmera lenta, tremida, confete, replay automático e acelerações do ritmo. Também respeita a preferência do sistema.">
          <input type="checkbox" checked={reduced} onChange={toggleReduced} /> Reduzir animações
        </label>
        {g.screen !== 'home' && !busy && (
          <button className="ghost" onClick={() => { if (!t || confirm('Voltar ao início? A Copa atual será perdida.')) resetAll(); }}>Início</button>
        )}
      </header>

      {error && <div className="error">Erro: {error}</div>}

      {g.screen === 'home' && (
        <Home
          quick={quick}
          resume={runInfo}
          onResume={() => savedRun && resumeRun(savedRun)}
          onDiscard={() => { if (confirm('Descartar a Copa em andamento?')) { repo.remove('run'); setSavedRun(undefined); } }}
          onExport={exportAll}
          onImport={(f) => void importFile(f)}
          message={homeMsg}
          onAchievements={() => go({ screen: 'achievements' })}
          modes={{
            onCareer: openCareer,
            hasCareer: !!repo.load('career')?.entries,
            onDaily: () => {
              registerCustom(undefined);
              go({ mode: 'daily', dailyDate: todayIso(), screen: 'dailyIntro' });
            },
            dailyDone: !!repo.load('daily')?.[todayIso()],
            onScenarios: () => go({ mode: 'scenario', scenarioFriend: undefined, screen: 'scenarios' }),
            scenariosDone: Object.keys(repo.load('scenarios') ?? {}).length,
            onDraft: () => go({ mode: 'draft', screen: 'draftSetup' }),
            onReady: () => {
              registerCustom(undefined);
              go({ mode: 'ready', screen: 'pick' });
            },
          }}
        />
      )}

      {g.screen === 'achievements' && <Achievements onBack={() => go({ screen: 'home' })} />}

      {g.screen === 'scenarios' && (
        <ScenarioList
          best={repo.load('scenarios') ?? {}}
          only={g.scenarioFriend ? scenarioById(g.scenarioFriend.id) : undefined}
          friend={g.scenarioFriend?.points}
          onPlay={playScenarioNow}
          onPick={(sc) => go({ mode: 'scenario', scenario: sc, nationId: sc.user, called: [], lineup: undefined, tournament: undefined, screen: 'squad' })}
          onAll={() => go({ scenarioFriend: undefined })}
          onBack={resetAll}
        />
      )}

      {g.screen === 'scenarioEnd' && g.scenario && g.scenarioOutcome && scenarioEnd(g.scenario, g.scenarioOutcome)}

      {g.screen === 'challengeIntro' && g.challenge && (
        <ChallengeIntro
          nationId={g.challenge.nationId}
          cut={g.challenge.cut}
          points={g.challenge.points}
          stage={g.challenge.stage}
          onBack={resetAll}
          onPlay={() => go({ called: [], lineup: undefined, scored: undefined, tournament: undefined, screen: 'squad' })}
        />
      )}

      {g.screen === 'dailyIntro' && g.dailyDate && (
        <DailyIntro
          date={g.dailyDate}
          team={dailyTeam(world, g.dailyDate)}
          best={repo.load('daily')?.[g.dailyDate]}
          onBack={() => go({ screen: 'home' })}
          onPlay={() => go({ nationId: dailyTeam(world, g.dailyDate as string).id, called: [], lineup: undefined, scored: undefined, tournament: undefined, screen: 'squad' })}
        />
      )}

      {g.screen === 'careerStart' && g.career && (
        <CareerChoose
          title="Comece sua carreira"
          subtitle="Três seleções sorteadas entre as mais fracas (potes 3 e 4). Escolha uma e faça história."
          ids={g.career.startOptions ?? []}
          onBack={() => go({ screen: 'home' })}
          onPick={(id) => {
            const career = persistCareer(takeTeam(g.career as Career, id));
            go({ career, screen: 'careerHome' });
          }}
        />
      )}

      {g.screen === 'careerHome' && g.career && (
        <CareerHome
          career={g.career}
          onBack={() => go({ screen: 'home' })}
          onAbandon={() => {
            repo.remove('career');
            resetAll();
          }}
          onPlay={() => {
            const c = g.career as Career;
            go({ nationId: c.nationId, called: c.called ?? [], lineup: c.lineup, careerApplied: false, careerResult: undefined, scored: undefined, tournament: undefined, screen: c.called && c.lineup ? 'tactics' : 'squad' });
          }}
        />
      )}

      {g.screen === 'pick' && (
        <PickNation initial={g.nationId} onBack={() => go({ screen: 'home' })} onPick={(id) => go({ nationId: id, called: id === g.nationId ? g.called : [], lineup: undefined, screen: 'squad' })} />
      )}

      {g.screen === 'draftSetup' && <DraftSetup initial={g.draftConfig} onBack={() => go({ screen: 'home' })} onStart={startNewDraft} />}

      {g.screen === 'draft' && g.draft && (
        <DraftBoard state={g.draft} onChange={(s) => go({ draft: s })} onFinish={finishDraft} onBack={() => { if (confirm('Sair do draft? O progresso será perdido.')) go({ screen: 'draftSetup' }); }} />
      )}

      {g.screen === 'squad' && g.nationId && (
        <Squad nationId={g.nationId} initial={g.called} readOnly={!!t} cond={t?.cond} onBack={() => go({ screen: t ? 'cup' : g.mode === 'career' ? 'careerHome' : g.mode === 'daily' ? 'dailyIntro' : g.mode === 'scenario' ? 'scenarios' : g.challenge ? 'challengeIntro' : 'pick' })} onConfirm={(ids) => go({ called: ids, lineup: undefined, screen: 'tactics' })} />
      )}

      {g.screen === 'tactics' && g.nationId && (
        <Tactics
          nationId={g.nationId}
          called={g.called}
          cond={t?.cond}
          initial={g.lineup ?? (t ? t.userLineup : undefined)}
          initialFormation={g.draftConfig?.formation}
          confirmLabel={t ? 'Salvar e voltar à Copa' : g.mode === 'scenario' ? 'Jogar o cenário' : g.mode === 'career' || g.mode === 'daily' || g.challenge ? 'Iniciar a Copa' : 'Escolher o recorte da Copa'}
          onBack={() => go({ screen: t ? 'cup' : g.mode === 'career' ? 'careerHome' : g.mode === 'draft' ? 'draft' : 'squad' })}
          onConfirm={(lineup) => {
            if (t) setG((prev) => ({ ...prev, lineup, tournament: { ...t, userLineup: lineup }, screen: 'cup' }));
            else if (g.mode === 'career' && g.career) {
              // carreira: guarda a convocação e a escalação e vai direto à Copa da época da seleção
              const career = persistCareer({ ...g.career, called: g.called, lineup });
              const nation = nationsById.get(career.nationId as string);
              setG((prev) => ({ ...prev, career }));
              void startCup(lineup, nation ? careerCut(world, nation) : 'all');
            } else if (g.mode === 'scenario' && g.scenario) {
              void startScenario(g.scenario, g.called, lineup);
            } else if (g.challenge) {
              // desafio de um amigo: mesma seed e mesmo recorte da Copa dele
              go({ lineup });
              void startCup(lineup, g.challenge.cut, g.challenge.seed);
            } else if (g.mode === 'daily' && g.dailyDate) {
              // desafio do dia: a seed vem da data, então todos jogam a mesma Copa
              go({ lineup });
              void startCup(lineup, dailyCut(world, dailyTeam(world, g.dailyDate)), dailySeed(g.dailyDate));
            } else go({ lineup, screen: 'cupSetup' });
          }}
        />
      )}

      {g.screen === 'cupSetup' && g.lineup && <CupSetup initial={g.cut} busy={busy} onBack={() => go({ screen: 'tactics' })} onStart={(cut) => void startCup(g.lineup as Lineup, cut)} />}

      {g.screen === 'cup' && t && (
        <Cup
          t={t}
          busy={busy}
          onPlay={() => go({ screen: 'match' })}
          onAdjust={() => go({ screen: 'tactics' })}
          onSquad={() => go({ screen: 'squad' })}
          onSimulateRest={simulateRest}
          onFinish={() => go({ screen: 'end' })}
        />
      )}

      {g.screen === 'match' && t && userFixture(t, world) && (
        <MatchIntro t={t} fixture={userFixture(t, world) as Fixture} busy={busy} onInstant={playInstant} onWatch={startLive} lastSpeed={lastSpeed} onBack={() => go({ screen: t.scenario ? 'scenarios' : 'cup' })} />
      )}

      {g.screen === 'live' && g.live && (
        <LiveMatch showTip={!settings.tipSeen} onTipSeen={() => saveSettings({ ...settings, tipSeen: true })} key={g.live.start.fixture.id} start={g.live.start} speed0={g.live.speed} reduced={reduced} onSpeed={rememberSpeed} onFinished={(r, rec) => void finishLive(r, rec)} onBack={() => void exitLive()} />
      )}

      {g.screen === 'post' && g.last && t && (
        <PostMatch report={g.last.report} fixture={g.last.fixture} userNationId={t.userNationId} onContinue={() => go({ screen: t.stage === 'DONE' ? (t.scenario ? 'scenarioEnd' : 'end') : 'cup' })} />
      )}

      {g.screen === 'end' && t && (
        <CupEnd
          t={t}
          onHome={resetAll}
          hideActions={g.mode === 'career'}
          extra={
            <>
              {g.scored && <ScoreCard summary={g.scored.summary} achievements={g.scored.achievements} />}
              {g.scored && endShare(g.scored.summary, g.scored.daily)}
              {g.mode === 'career' && g.career && g.careerResult ? (
            <CareerAfterCup
              career={g.career}
              result={g.careerResult}
              onChoose={(id) => {
                const career = persistCareer(takeTeam(g.career as Career, id));
                go({ career, tournament: undefined, careerApplied: false, careerResult: undefined, scored: undefined, screen: 'careerHome' });
              }}
              onKeep={() => {
                const career = persistCareer({ ...(g.career as Career), offers: undefined });
                go({ career, tournament: undefined, careerApplied: false, careerResult: undefined, scored: undefined, screen: 'careerHome' });
              }}
            />
              ) : null}
            </>
          }
          onNewCup={() => (g.mode === 'draft' ? setG({ ...FRESH, mode: 'draft', draftConfig: g.draftConfig, screen: 'draftSetup' }) : g.mode === 'daily' ? setG({ ...FRESH, mode: 'daily', dailyDate: g.dailyDate, screen: 'dailyIntro' }) : setG({ ...FRESH, mode: 'ready', screen: 'pick', nationId: g.nationId }))}
        />
      )}
    </div>
  );
}
