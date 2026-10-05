/// <reference lib="webworker" />
import worldJson from '../../data/world.json';
import { MatchSimulator, simulateMatch, type LiveState, type MatchCommand, type TeamSetup } from './match';
import {
  buildSetup,
  createTournament,
  type Cut,
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
import { createScenario, scenarioById } from './scenarios';
import type { Lineup, MatchEvent, MatchReport, NationEra, World } from './types';

/**
 * Worker do motor: toda simulação roda aqui, fora da thread da interface.
 * Protocolo: { id, type, ...payload } -> { id, ok: true, result } | { id, ok: false, error }.
 */
const world = worldJson as unknown as World;

export interface Requests {
  createTournament: { nationId: string; squad: string[]; lineup: Lineup; seed: number; cut?: Cut; custom?: NationEra };
  createScenario: { scenarioId: string; squad: string[]; lineup: Lineup };
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
  /** Qualquer comando do usuário (troca, tática, grito, conversa); entra no log da partida. */
  matchCommand: { cmd: MatchCommand };
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
  createScenario: Tournament;
  instantUserMatch: { report: MatchReport; fixture: Fixture; userSide: 0 | 1; record: MatchRecord };
  playRound: RoundOutcome;
  playRemaining: Tournament;
  matchStart: MatchDelta & { fixture: Fixture; userSide: 0 | 1; seed: number };
  matchAdvance: MatchDelta;
  matchFinish: MatchDelta;
  matchCommand: MatchDelta;
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
  createTournament: (p) => createTournament(world, p.nationId, p.squad, p.lineup, p.seed, { cut: p.cut, custom: p.custom }),
  createScenario: (p) => {
    const sc = scenarioById(p.scenarioId);
    if (!sc) throw new Error(`Cenário desconhecido: ${p.scenarioId}`);
    return createScenario(world, sc, p.squad, p.lineup);
  },
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
    return { ...delta(), fixture, userSide: fixture.home === t.userNationId ? 0 : 1, seed: fixtureSeed(t, fixture) };
  },
  matchAdvance: ({ until }) => {
    session?.sim.playUntil(until);
    return delta();
  },
  matchFinish: () => {
    session?.sim.playToEnd();
    return delta(true);
  },
  matchCommand: ({ cmd }) => {
    const ok = session?.sim.execute(cmd) ?? false;
    return { ...delta(), ok };
  },
};

self.onmessage = (ev: MessageEvent<{ id: number; type: RequestType } & Record<string, unknown>>) => {
  const { id, type, ...payload } = ev.data;
  try {
    // só os tipos conhecidos (nada de "constructor" ou "__proto__" vindos da mensagem)
    if (!Object.hasOwn(handlers, type)) throw new Error(`Pedido desconhecido: ${String(type)}`);
    const handler = handlers[type] as (p: unknown) => unknown;
    self.postMessage({ id, ok: true, result: handler(payload) });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
