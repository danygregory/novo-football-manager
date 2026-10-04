import { useState } from 'react';
import { STAGE_LABEL, userFixture, type Cut, type Fixture, type MatchRecord, type Tournament } from '../engine/tournament';
import { finalizeDraft, startDraft, type DraftConfig, type DraftState } from '../data/draft';
import { squadOf } from '../data/squads';
import type { Lineup, MatchReport } from '../engine/types';
import { Kit } from './components/common';
import { DEFAULT_SPEED, isSpeed, type Speed } from './speed';
import { engine } from './engineClient';
import { Cup } from './screens/Cup';
import { CupEnd } from './screens/CupEnd';
import { CupSetup } from './screens/CupSetup';
import { DraftBoard } from './screens/DraftBoard';
import { DraftSetup } from './screens/DraftSetup';
import { Home } from './screens/Home';
import { ModeSelect } from './screens/ModeSelect';
import { LiveMatch, type LiveStart } from './screens/LiveMatch';
import { MatchIntro } from './screens/Match';
import { PickNation } from './screens/PickNation';
import { PostMatch } from './screens/PostMatch';
import { PenaltyDemo } from './screens/PenaltyDemo';
import { Squad } from './screens/Squad';
import { Tactics } from './screens/Tactics';
import { nationLabel, nationsById, registerCustom, world } from './world';

type Screen = 'home' | 'mode' | 'pick' | 'squad' | 'draftSetup' | 'draft' | 'tactics' | 'cupSetup' | 'cup' | 'match' | 'live' | 'post' | 'end';

interface Game {
  screen: Screen;
  /** Seleção pronta ou time montado no draft. */
  mode?: 'ready' | 'draft';
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

  const startCup = (lineup: Lineup, cut: Cut) =>
    guarded(async () => {
      const seed = Math.floor(Math.random() * 2 ** 32);
      const custom = g.mode === 'draft' ? nationsById.get(g.nationId as string) : undefined;
      const tournament = await engine.call('createTournament', { nationId: g.nationId as string, squad: g.called, lineup, seed, cut, custom: custom?.custom ? custom : undefined });
      setG((prev) => ({ ...prev, lineup, cut, tournament, screen: 'cup', last: undefined }));
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

      {g.screen === 'home' && <Home canLoad={false} onNew={() => go({ screen: 'mode' })} onLoad={() => undefined} />}

      {g.screen === 'mode' && (
        <ModeSelect
          onBack={() => go({ screen: 'home' })}
          onReady={() => { registerCustom(undefined); go({ mode: 'ready', screen: 'pick' }); }}
          onDraft={() => go({ mode: 'draft', screen: 'draftSetup' })}
        />
      )}

      {g.screen === 'pick' && (
        <PickNation initial={g.nationId} onBack={() => go({ screen: 'mode' })} onPick={(id) => go({ nationId: id, called: id === g.nationId ? g.called : [], lineup: undefined, screen: 'squad' })} />
      )}

      {g.screen === 'draftSetup' && <DraftSetup initial={g.draftConfig} onBack={() => go({ screen: 'mode' })} onStart={startNewDraft} />}

      {g.screen === 'draft' && g.draft && (
        <DraftBoard state={g.draft} onChange={(s) => go({ draft: s })} onFinish={finishDraft} onBack={() => { if (confirm('Sair do draft? O progresso será perdido.')) go({ screen: 'draftSetup' }); }} />
      )}

      {g.screen === 'squad' && g.nationId && (
        <Squad nationId={g.nationId} initial={g.called} readOnly={!!t} cond={t?.cond} onBack={() => go({ screen: t ? 'cup' : 'pick' })} onConfirm={(ids) => go({ called: ids, lineup: undefined, screen: 'tactics' })} />
      )}

      {g.screen === 'tactics' && g.nationId && (
        <Tactics
          nationId={g.nationId}
          called={g.called}
          cond={t?.cond}
          initial={g.lineup ?? (t ? t.userLineup : undefined)}
          initialFormation={g.draftConfig?.formation}
          confirmLabel={t ? 'Salvar e voltar à Copa' : 'Escolher o recorte da Copa'}
          onBack={() => go({ screen: t ? 'cup' : g.mode === 'draft' ? 'draft' : 'squad' })}
          onConfirm={(lineup) => {
            if (t) setG((prev) => ({ ...prev, lineup, tournament: { ...t, userLineup: lineup }, screen: 'cup' }));
            else go({ lineup, screen: 'cupSetup' });
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
          onNewCup={() => (g.mode === 'draft' ? setG({ ...FRESH, mode: 'draft', draftConfig: g.draftConfig, screen: 'draftSetup' }) : setG({ ...FRESH, mode: 'ready', screen: 'pick', nationId: g.nationId }))}
        />
      )}
    </div>
  );
}
