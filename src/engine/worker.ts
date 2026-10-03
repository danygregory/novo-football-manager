/// <reference lib="webworker" />
import worldJson from '../../data/world.json';
import { simulateMatch, type TeamSetup } from './match';
import {
  buildSetup,
  createTournament,
  fixtureSeed,
  playRemaining,
  playRound,
  userFixture,
  type Fixture,
  type RoundOutcome,
  type Tournament,
} from './tournament';
import type { Lineup, MatchReport, World } from './types';

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
  playRound: { tournament: Tournament; userReport?: MatchReport };
  playRemaining: { tournament: Tournament };
}

export interface Responses {
  createTournament: Tournament;
  instantUserMatch: { report: MatchReport; fixture: Fixture; userSide: 0 | 1 };
  playRound: RoundOutcome;
  playRemaining: Tournament;
}

export type RequestType = keyof Requests;

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
    return { report, fixture, userSide: fixture.home === t.userNationId ? 0 : 1 };
  },
  playRound: (p) => playRound(world, p.tournament, p.userReport),
  playRemaining: (p) => playRemaining(world, p.tournament),
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
