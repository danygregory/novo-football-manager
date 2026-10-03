import { useState } from 'react';
import { STAGE_LABEL, userFixture, type Fixture, type MatchRecord, type Tournament } from '../engine/tournament';
import type { Lineup, MatchReport } from '../engine/types';
import { Kit } from './components/common';
import { engine } from './engineClient';
import { Cup } from './screens/Cup';
import { CupEnd } from './screens/CupEnd';
import { Home } from './screens/Home';
import { LiveMatch, type LiveStart } from './screens/LiveMatch';
import { MatchIntro } from './screens/Match';
import { PickNation } from './screens/PickNation';
import { PostMatch } from './screens/PostMatch';
import { Squad } from './screens/Squad';
import { Tactics } from './screens/Tactics';
import { nationsById, world } from './world';

type Screen = 'home' | 'pick' | 'squad' | 'tactics' | 'cup' | 'match' | 'live' | 'post' | 'end';

interface Game {
  screen: Screen;
  nationId?: string;
  called: string[];
  lineup?: Lineup;
  tournament?: Tournament;
  last?: { report: MatchReport; fixture: Fixture };
  live?: { start: LiveStart; speed: 1 | 4 };
}

const FRESH: Game = { screen: 'home', called: [] };

export function App() {
  const [g, setG] = useState<Game>(FRESH);
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

  const startCup = (lineup: Lineup) =>
    guarded(async () => {
      const seed = Math.floor(Math.random() * 2 ** 32);
      const tournament = await engine.call('createTournament', { nationId: g.nationId as string, squad: g.called, lineup, seed });
      setG((prev) => ({ ...prev, lineup, tournament, screen: 'cup', last: undefined }));
    });

  const playInstant = () =>
    guarded(async () => {
      const t = g.tournament as Tournament;
      const { report, fixture, record } = await engine.call('instantUserMatch', { tournament: t });
      const { tournament } = await engine.call('playRound', { tournament: t, userReport: report, record });
      setG((prev) => ({ ...prev, tournament, last: { report, fixture }, screen: 'post' }));
    });

  const startLive = (speed: 1 | 4) =>
    guarded(async () => {
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
    <div className="app">
      <header className="topbar">
        <div className="brand">NOVO <span>FM</span></div>
        <div className="crumbs">
          {user && (
            <>
              <Kit nation={user} />
              <b>{user.country}</b> · anos {String(user.decade).slice(2)}
              {t && <> · {STAGE_LABEL[t.stage]}</>}
            </>
          )}
        </div>
        {g.screen !== 'home' && !busy && (
          <button className="ghost" onClick={() => { if (!t || confirm('Voltar ao início? A Copa atual será perdida.')) setG(FRESH); }}>Início</button>
        )}
      </header>

      {error && <div className="error">Erro: {error}</div>}

      {g.screen === 'home' && <Home canLoad={false} onNew={() => go({ screen: 'pick' })} onLoad={() => undefined} />}

      {g.screen === 'pick' && (
        <PickNation initial={g.nationId} onBack={() => go({ screen: 'home' })} onPick={(id) => go({ nationId: id, called: id === g.nationId ? g.called : [], lineup: undefined, screen: 'squad' })} />
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
          confirmLabel={t ? 'Salvar e voltar à Copa' : 'Iniciar Copa'}
          onBack={() => go({ screen: t ? 'cup' : 'squad' })}
          onConfirm={(lineup) => {
            if (t) setG((prev) => ({ ...prev, lineup, tournament: { ...t, userLineup: lineup }, screen: 'cup' }));
            else void startCup(lineup);
          }}
        />
      )}

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
        <MatchIntro t={t} fixture={userFixture(t, world) as Fixture} busy={busy} onInstant={playInstant} onWatch={startLive} onBack={() => go({ screen: 'cup' })} />
      )}

      {g.screen === 'live' && g.live && (
        <LiveMatch key={g.live.start.fixture.id} start={g.live.start} speed0={g.live.speed} onFinished={(r, rec) => void finishLive(r, rec)} onBack={() => void exitLive()} />
      )}

      {g.screen === 'post' && g.last && t && (
        <PostMatch report={g.last.report} fixture={g.last.fixture} userNationId={t.userNationId} onContinue={() => go({ screen: t.stage === 'DONE' ? 'end' : 'cup' })} />
      )}

      {g.screen === 'end' && t && (
        <CupEnd
          t={t}
          onHome={() => setG(FRESH)}
          onNewCup={() => setG({ screen: 'pick', called: [], nationId: g.nationId })}
        />
      )}
    </div>
  );
}
