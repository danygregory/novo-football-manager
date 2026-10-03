/// <reference lib="webworker" />
import worldJson from '../../data/world.json';
import { MatchSimulator, simulateMatch, type LiveState, type TeamSetup } from './match';
import {
  buildSetup,
  createTournament,
  fixtureSeed,
  playRemaining,
  playRound,
  startRecord,
  userFixture,
  type Fixture,
  type MatchRecord,
  type RoundOutcome,
  type Tournament,
} from './tournament';
import type { Lineup, MatchEvent, MatchReport, Tactics, World } from './types';

/**
 * Worker do motor: toda simulação roda aqui, fora da thread da interface.
 * Protocolo: { id, type, ...payload } -> { id, ok: true, result } | { id, ok: false, error }.
 */
const world = worldJson as unknown as World;

export interface Requests {
  createTournament: { nationId: string; squad: string[]; lineup: Lineup; seed: number };
  /** Simula a partida do usuário na rodada atual de uma vez (detalhe completo). */
  instantUserMatch: { tournament: Tournament };
  /** Fecha a rodada (IA joga os demais jogos) com o relatório da partida do usuário. */
  playRound: { tournament: Tournament; userReport?: MatchReport; record?: MatchRecord };
  playRemaining: { tournament: Tournament };
  /** Abre uma partida ao vivo do usuário na rodada atual (a sessão fica no worker). */
  matchStart: { tournament: Tournament };
  /** Simula até o minuto indicado e devolve os eventos novos e o estado. */
  matchAdvance: { until: number };
  matchFinish: Record<string, never>;
  matchSubstitute: { side: 0 | 1; outId: string; inId: string };
  matchTactics: { side: 0 | 1; tactics: Tactics };
}

export interface MatchDelta {
  events: MatchEvent[];
  state: LiveState;
  /** Presente quando a partida acabou. */
  report?: MatchReport;
  /** Registro para replay (seed, escalações e comandos); presente quando a partida acabou. */
  record?: MatchRecord;
  ok?: boolean;
}

export interface Responses {
  createTournament: Tournament;
  instantUserMatch: { report: MatchReport; fixture: Fixture; userSide: 0 | 1; record: MatchRecord };
  playRound: RoundOutcome;
  playRemaining: Tournament;
  matchStart: MatchDelta & { fixture: Fixture; userSide: 0 | 1 };
  matchAdvance: MatchDelta;
  matchFinish: MatchDelta;
  matchSubstitute: MatchDelta;
  matchTactics: MatchDelta;
}

export type RequestType = keyof Requests;

let session: { sim: MatchSimulator; cursor: number; record: MatchRecord } | undefined;

function delta(withReport = false): MatchDelta {
  if (!session) throw new Error('Nenhuma partida ao vivo aberta.');
  const { sim } = session;
  const log = sim.eventLog;
  const events = log.slice(session.cursor) as MatchEvent[];
  session.cursor = log.length;
  const state = sim.liveState();
  const finished = withReport || state.finished;
  return {
    events,
    state,
    report: finished ? sim.report() : undefined,
    record: finished ? { ...session.record, commands: [...sim.commands] } : undefined,
  };
}

const handlers: { [K in RequestType]: (p: Requests[K]) => Responses[K] } = {
  createTournament: (p) => createTournament(world, p.nationId, p.squad, p.lineup, p.seed),
  instantUserMatch: ({ tournament: t }) => {
    const fixture = userFixture(t, world);
    if (!fixture) throw new Error('O usuário não tem partida nesta rodada.');
    const setups: [TeamSetup, TeamSetup] = [
      buildSetup(world, t, fixture.home, fixture.home === t.userNationId),
      buildSetup(world, t, fixture.away, fixture.away === t.userNationId),
    ];
    const report = simulateMatch(setups, { seed: fixtureSeed(t, fixture), knockout: !t.stage.startsWith('G'), detail: 'full' });
    return { report, fixture, userSide: fixture.home === t.userNationId ? 0 : 1, record: startRecord(t, fixture, setups) };
  },
  playRound: (p) => playRound(world, p.tournament, p.userReport, p.record),
  playRemaining: (p) => playRemaining(world, p.tournament),
  matchStart: ({ tournament: t }) => {
    const fixture = userFixture(t, world);
    if (!fixture) throw new Error('O usuário não tem partida nesta rodada.');
    const setups: [TeamSetup, TeamSetup] = [
      buildSetup(world, t, fixture.home, fixture.home === t.userNationId),
      buildSetup(world, t, fixture.away, fixture.away === t.userNationId),
    ];
    const sim = new MatchSimulator(setups, { seed: fixtureSeed(t, fixture), knockout: !t.stage.startsWith('G'), detail: 'full' });
    session = { sim, cursor: 0, record: startRecord(t, fixture, setups) };
    return { ...delta(), fixture, userSide: fixture.home === t.userNationId ? 0 : 1 };
  },
  matchAdvance: ({ until }) => {
    session?.sim.playUntil(until);
    return delta();
  },
  matchFinish: () => {
    session?.sim.playToEnd();
    return delta(true);
  },
  matchSubstitute: ({ side, outId, inId }) => {
    const ok = session?.sim.substitute(side, outId, inId) ?? false;
    return { ...delta(), ok };
  },
  matchTactics: ({ side, tactics }) => {
    session?.sim.setTactics(side, tactics);
    return delta();
  },
};

self.onmessage = (ev: MessageEvent<{ id: number; type: RequestType } & Record<string, unknown>>) => {
  const { id, type, ...payload } = ev.data;
  try {
    const handler = handlers[type] as (p: unknown) => unknown;
    self.postMessage({ id, ok: true, result: handler(payload) });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
