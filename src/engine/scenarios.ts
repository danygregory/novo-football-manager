import { squadOf } from '../data/squads';
import { autoSquad23 } from './lineup';
import { hashSeed } from './prng';
import { nationOf, winnerOf, type MatchResult, type Tournament } from './tournament';
import type { Lineup, World } from './types';

/**
 * Cenários: uma partida de mata-mata (com prorrogação e pênaltis) entre duas seleções-era, com seed fixa.
 * Todo mundo joga o mesmo jogo; o que muda é o elenco e a tática de cada um (e as decisões ao vivo).
 * Os cenários só citam épocas e seleções, nunca jogadores nem escudos reais.
 */
export interface Scenario {
  id: string;
  title: string;
  /** Uma frase que explica a tensão do jogo. */
  blurb: string;
  /** Seleção do jogador e adversária (ids de data/world.json). */
  user: string;
  opponent: string;
  /** Escolhida em `npm run scenarios-balance -- --salts` para que a escalação automática perca por pouco: o jogador precisa fazer algo. */
  salt: number;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'milagre-berna', title: 'O milagre de Berna', blurb: 'A melhor seleção de 1954 contra a Alemanha Ocidental. Quem apostou no azarão mudou a história: não deixe acontecer de novo.', user: 'HUN-1954-1957', opponent: 'GER-1950', salt: 1 },
  { id: 'maracanazo', title: 'Maracanazo', blurb: 'O Uruguai dos anos 50 contra o Brasil, o favorito da década. Todo o estádio espera o título dos donos da casa.', user: 'URU-1950', opponent: 'BRA-1950', salt: 4 },
  { id: 'davi-golias', title: 'Davi e Golias', blurb: 'Os Estados Unidos dos anos 70 contra o Brasil de 70, a seleção mais forte do banco de dados. É quase impossível: quase.', user: 'USA-1970', opponent: 'BRA-1970', salt: 1 },
  { id: 'brasil-contra-brasil', title: 'Brasil 70 contra Brasil de hoje', blurb: 'Dá para o Brasil dos anos 70 vencer o dos anos 20? A pergunta que todo bar já fez.', user: 'BRA-1970', opponent: 'BRA-2020', salt: 2 },
  { id: 'tiki-taka', title: 'Tiki-taka contra os pioneiros', blurb: 'A Espanha de 2010–13 contra a Hungria de 1954–57: o futebol de posse de bola, moderno e antigo, frente a frente.', user: 'ESP-2010-2013', opponent: 'HUN-1954-1957', salt: 16 },
  { id: 'laranja', title: 'A máquina laranja', blurb: 'A Holanda dos anos 70 contra a Alemanha Ocidental. Futebol total contra eficiência.', user: 'NED-1970', opponent: 'GER-1970', salt: 1 },
  { id: 'final-moderna', title: 'Final dos anos 20', blurb: 'Argentina contra França, as duas seleções mais fortes da década. Decida nos detalhes (e talvez nos pênaltis).', user: 'ARG-2020', opponent: 'FRA-2020', salt: 1 },
  { id: 'caiu-no-grupo', title: 'A zebra africana', blurb: 'Camarões dos anos 70 contra a Inglaterra da mesma época. Ninguém dá nada pela sua seleção, e é por isso que vale.', user: 'CMR-1970', opponent: 'ENG-1970', salt: 0 },
];

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find((s) => s.id === id);

/** A partida do cenário usa uma seed fixa derivada do id: o mesmo jogo para todos. */
export function createScenario(world: World, sc: Scenario, userSquad: string[], userLineup: Lineup): Tournament {
  const squads: Record<string, string[]> = {};
  const cond: Record<string, number> = {};
  for (const id of [sc.user, sc.opponent]) {
    const n = nationOf(world, id);
    const ids = id === sc.user ? userSquad : autoSquad23(squadOf(n)).map((p) => p.id);
    squads[id] = ids;
    for (const p of squadOf(n)) if (ids.includes(p.id)) cond[p.id] = p.condition;
  }
  return {
    seed: hashSeed(`scenario:${sc.id}:${sc.salt}`),
    userNationId: sc.user,
    cut: 'all',
    participants: [sc.user, sc.opponent],
    squads,
    userLineup,
    cond,
    groups: [],
    results: [],
    stage: 'F',
    userMatches: [],
    stats: { goals: {}, ratingSum: {}, apps: {} },
    scenario: { id: sc.id, opponent: sc.opponent },
  };
}

export interface ScenarioResult {
  result: 'W' | 'L';
  /** Texto curto: "Vitória", "Vitória nos pênaltis", "Derrota por 1 a 3"... */
  text: string;
  score: [number, number];
  shootout?: [number, number];
  /** Vitória em prorrogação ou pênaltis. */
  extra: boolean;
  points: number;
  /** Bônus por vencer um adversário mais forte. */
  underdog: number;
}

export const SCENARIO_POINTS = { win: 100, perGoalMargin: 15, maxMargin: 4, underdogDiv: 5, underdogMax: 150, lossPerGoal: 5, lossMax: 20 } as const;

/** Pontos: vitória 100 + 15 por gol de saldo (até 4) + bônus de azarão (diferença de Elo / 5, até 150); derrota vale 5 por gol marcado (até 20). */
export function scenarioResult(world: World, t: Tournament): ScenarioResult | undefined {
  const r: MatchResult | undefined = t.results.find((x) => x.stage === 'F');
  if (!r || !t.scenario) return undefined;
  const me = t.userNationId;
  const mine: 0 | 1 = r.teams[0] === me ? 0 : 1;
  const other: 0 | 1 = mine === 0 ? 1 : 0;
  const score: [number, number] = [r.score[mine], r.score[other]];
  const shootout = r.shootout ? ([r.shootout[mine], r.shootout[other]] as [number, number]) : undefined;
  const won = winnerOf(r) === me;
  const extra = r.extraTime || !!r.shootout;
  const diff = nationOf(world, t.scenario.opponent).elo - nationOf(world, me).elo;
  const P = SCENARIO_POINTS;
  const underdog = won ? Math.max(0, Math.min(P.underdogMax, Math.round(diff / P.underdogDiv))) : 0;
  const points = won ? P.win + P.perGoalMargin * Math.min(P.maxMargin, Math.max(0, score[0] - score[1])) + underdog : Math.min(P.lossMax, P.lossPerGoal * score[0]);
  const text = won ? (shootout ? 'Vitória nos pênaltis' : extra ? 'Vitória na prorrogação' : 'Vitória') : shootout ? 'Derrota nos pênaltis' : `Derrota por ${score[0]} a ${score[1]}`;
  return { result: won ? 'W' : 'L', text, score, shootout, extra, points, underdog };
}
