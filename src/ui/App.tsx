import { useEffect, useState } from 'react';
import { STAGE_LABEL, userFixture, type Cut, type Fixture, type MatchRecord, type Tournament } from '../engine/tournament';
import { finalizeDraft, startDraft, type DraftConfig, type DraftState } from '../data/draft';
import { squadOf } from '../data/squads';
import type { Lineup, MatchReport } from '../engine/types';
import { applyCup, careerCut, newCareer, reputationDelta, takeTeam, type Career, type CupEvaluation } from '../engine/career';
import { Kit } from './components/common';
import { KEYS, loadJson, removeKey, saveJson, todayIso } from './store';
import { DEFAULT_SPEED, isSpeed, type Speed } from './speed';
import { engine } from './engineClient';
import { Cup } from './screens/Cup';
import { CupEnd } from './screens/CupEnd';
import { Achievements } from './screens/Achievements';
import { DailyIntro, DailyShare } from './screens/Daily';
import { bestOfDay, dailySeed, dailyTeam, shareText, type DailyRecord } from '../engine/daily';
import { ScoreCard } from './screens/ScoreCard';
import { addToRanking, newAchievements, rankingEntry, summarizeCup, type Achievement, type CupSummary, type RankingEntry } from '../engine/scoring';
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

type Screen = 'home' | 'achievements' | 'dailyIntro' | 'careerStart' | 'careerHome' | 'pick' | 'squad' | 'draftSetup' | 'draft' | 'tactics' | 'cupSetup' | 'cup' | 'match' | 'live' | 'post' | 'end';

interface Game {
  screen: Screen;
  /** Seleção pronta ou time montado no draft. */
  mode?: 'ready' | 'draft' | 'career' | 'daily';
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

const FRESH: Game = { screen: 'home', called: [], cut: 'all' };

const SETTINGS_KEY = 'novo-fm-settings';

interface Settings {
  reduceMotion?: boolean;
  /** Última velocidade escolhida (2x ou 4x). */
  speed?: Speed;
}

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Settings;
    return { ...s, speed: isSpeed(s.speed) ? s.speed : undefined };
  } catch {
    return {};
  }
}

export function App() {
  if (typeof location !== 'undefined' && location.hash === '#penalty-demo') return <PenaltyDemo />;
  return <MainApp />;
}

function MainApp() {
  const [g, setG] = useState<Game>(FRESH);
  const [settings, setSettings] = useState(loadSettings);
  const systemReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const reduced = settings.reduceMotion ?? systemReduced;
  const saveSettings = (next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* sem armazenamento: a escolha vale só nesta sessão */
    }
  };
  const toggleReduced = () => saveSettings({ ...settings, reduceMotion: !reduced });
  const lastSpeed: Speed = settings.speed ?? DEFAULT_SPEED;
  const rememberSpeed = (s: Speed) => {
    if (s !== settings.speed) saveSettings({ ...settings, speed: s });
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

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

  const startCup = (lineup: Lineup, cut: Cut, fixedSeed?: number) =>
    guarded(async () => {
      const seed = fixedSeed ?? Math.floor(Math.random() * 2 ** 32);
      const custom = g.mode === 'draft' ? nationsById.get(g.nationId as string) : undefined;
      const tournament = await engine.call('createTournament', { nationId: g.nationId as string, squad: g.called, lineup, seed, cut, custom: custom?.custom ? custom : undefined });
      setG((prev) => ({ ...prev, lineup, cut, tournament, screen: 'cup', last: undefined, scored: undefined }));
    });

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
    if (g.screen !== 'end' || !g.tournament || g.scored) return;
    const t0 = g.tournament;
    const summary = summarizeCup(world, t0);
    let career = g.career;
    let careerResult = g.careerResult;
    if (g.mode === 'career' && career && !g.careerApplied) {
      career = applyCup(world, career, t0, summary.ev, summary.total);
      saveJson(KEYS.career, career);
      careerResult = { delta: reputationDelta(summary.ev), ev: summary.ev };
    }
    const stats = loadJson<{ cups: number }>(KEYS.stats) ?? { cups: 0 };
    const already = new Set(Object.keys(loadJson<Record<string, string>>(KEYS.achievements) ?? {}));
    const achievements = newAchievements(
      summary,
      { daily: g.mode === 'daily', careerTitles: career?.entries.filter((e) => e.champion).length, careerRep: g.mode === 'career' ? career?.rep : undefined, previousCups: stats.cups },
      already,
    );
    const date = todayIso();
    if (achievements.length) saveJson(KEYS.achievements, { ...(loadJson<Record<string, string>>(KEYS.achievements) ?? {}), ...Object.fromEntries(achievements.map((a) => [a.id, date])) });
    const team = nationsById.get(t0.userNationId)?.country ?? t0.userNationId;
    saveJson(KEYS.ranking, addToRanking(loadJson<RankingEntry[]>(KEYS.ranking) ?? [], rankingEntry(summary, g.mode ?? 'ready', team, date)));
    saveJson(KEYS.stats, { cups: stats.cups + 1 });
    let dailyRecord: DailyRecord | undefined;
    if (g.mode === 'daily' && g.dailyDate) {
      const dayTeam = dailyTeam(world, g.dailyDate);
      const text = shareText(g.dailyDate, dayTeam, summary, `${dayTeam.country} ${eraSpan(dayTeam)}`);
      const all = loadJson<Record<string, DailyRecord>>(KEYS.daily) ?? {};
      dailyRecord = bestOfDay(all[g.dailyDate], { date: g.dailyDate, points: summary.total, stageText: summary.stageText, champion: summary.ev.champion, text });
      // o texto compartilhado mostra a campanha desta partida; o melhor do dia fica salvo
      saveJson(KEYS.daily, { ...all, [g.dailyDate]: dailyRecord });
      dailyRecord = { date: g.dailyDate, points: summary.total, stageText: summary.stageText, champion: summary.ev.champion, text };
    }
    setG((prev) => ({ ...prev, career, careerApplied: prev.mode === 'career' ? true : prev.careerApplied, careerResult, scored: { summary, achievements, daily: dailyRecord } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.screen]);

  const persistCareer = (career: Career) => {
    saveJson(KEYS.career, career);
    return career;
  };

  const openCareer = () => {
    registerCustom(undefined);
    let career = loadJson<Career>(KEYS.career);
    if (!career || !Array.isArray(career.entries)) career = persistCareer(newCareer(world, Math.floor(Math.random() * 2 ** 31)));
    const screen: Screen = career.startOptions?.length && !career.nationId ? 'careerStart' : 'careerHome';
    setG((prev) => ({ ...FRESH, mode: 'career', career, screen, cut: prev.cut }));
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
              {t && <> · {STAGE_LABEL[t.stage]}</>}
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
          canLoad={false}
          onLoad={() => undefined}
          onAchievements={() => go({ screen: 'achievements' })}
          modes={{
            onCareer: openCareer,
            hasCareer: !!loadJson<Career>(KEYS.career)?.entries,
            onDaily: () => {
              registerCustom(undefined);
              go({ mode: 'daily', dailyDate: todayIso(), screen: 'dailyIntro' });
            },
            dailyDone: !!loadJson<Record<string, DailyRecord>>(KEYS.daily)?.[todayIso()],
            onDraft: () => go({ mode: 'draft', screen: 'draftSetup' }),
            onReady: () => {
              registerCustom(undefined);
              go({ mode: 'ready', screen: 'pick' });
            },
          }}
        />
      )}

      {g.screen === 'achievements' && <Achievements onBack={() => go({ screen: 'home' })} />}

      {g.screen === 'dailyIntro' && g.dailyDate && (
        <DailyIntro
          date={g.dailyDate}
          team={dailyTeam(world, g.dailyDate)}
          best={loadJson<Record<string, DailyRecord>>(KEYS.daily)?.[g.dailyDate]}
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
            removeKey(KEYS.career);
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
        <Squad nationId={g.nationId} initial={g.called} readOnly={!!t} cond={t?.cond} onBack={() => go({ screen: t ? 'cup' : g.mode === 'career' ? 'careerHome' : g.mode === 'daily' ? 'dailyIntro' : 'pick' })} onConfirm={(ids) => go({ called: ids, lineup: undefined, screen: 'tactics' })} />
      )}

      {g.screen === 'tactics' && g.nationId && (
        <Tactics
          nationId={g.nationId}
          called={g.called}
          cond={t?.cond}
          initial={g.lineup ?? (t ? t.userLineup : undefined)}
          initialFormation={g.draftConfig?.formation}
          confirmLabel={t ? 'Salvar e voltar à Copa' : g.mode === 'career' || g.mode === 'daily' ? 'Iniciar a Copa' : 'Escolher o recorte da Copa'}
          onBack={() => go({ screen: t ? 'cup' : g.mode === 'career' ? 'careerHome' : g.mode === 'draft' ? 'draft' : 'squad' })}
          onConfirm={(lineup) => {
            if (t) setG((prev) => ({ ...prev, lineup, tournament: { ...t, userLineup: lineup }, screen: 'cup' }));
            else if (g.mode === 'career' && g.career) {
              // carreira: guarda a convocação e a escalação e vai direto à Copa da época da seleção
              const career = persistCareer({ ...g.career, called: g.called, lineup });
              const nation = nationsById.get(career.nationId as string);
              setG((prev) => ({ ...prev, career }));
              void startCup(lineup, nation ? careerCut(world, nation) : 'all');
            } else if (g.mode === 'daily' && g.dailyDate) {
              // desafio do dia: a seed vem da data, então todos jogam a mesma Copa
              go({ lineup });
              void startCup(lineup, 'all', dailySeed(g.dailyDate));
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
        <MatchIntro t={t} fixture={userFixture(t, world) as Fixture} busy={busy} onInstant={playInstant} onWatch={startLive} lastSpeed={lastSpeed} onBack={() => go({ screen: 'cup' })} />
      )}

      {g.screen === 'live' && g.live && (
        <LiveMatch key={g.live.start.fixture.id} start={g.live.start} speed0={g.live.speed} reduced={reduced} onSpeed={rememberSpeed} onFinished={(r, rec) => void finishLive(r, rec)} onBack={() => void exitLive()} />
      )}

      {g.screen === 'post' && g.last && t && (
        <PostMatch report={g.last.report} fixture={g.last.fixture} userNationId={t.userNationId} onContinue={() => go({ screen: t.stage === 'DONE' ? 'end' : 'cup' })} />
      )}

      {g.screen === 'end' && t && (
        <CupEnd
          t={t}
          onHome={resetAll}
          hideActions={g.mode === 'career'}
          extra={
            <>
              {g.scored && <ScoreCard summary={g.scored.summary} achievements={g.scored.achievements} />}
              {g.scored?.daily && <DailyShare record={g.scored.daily} />}
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
