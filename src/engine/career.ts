import { eloExpected } from './calibration';
import { Rng, hashSeed } from './prng';
import { nationOf, winnerOf, withCustom, type Cut, type Stage, type Tournament } from './tournament';
import type { Lineup, NationEra, World } from './types';

/**
 * Modo carreira de técnico: reputação de 0 a 100, que sobe com campanhas acima do esperado para a força do time e cai com
 * fracassos; depois de cada Copa chegam 0 a 3 convites de seleções compatíveis com a reputação.
 */
export const START_REPUTATION = 20;

/** Etapa mais longe que o time chegou: 0 grupos, 1 oitavas, 2 quartas, 3 semifinal, 4 final (vice), 5 campeão. */
export type StageValue = 0 | 1 | 2 | 3 | 4 | 5;
export const STAGE_VALUE_LABEL = ['Fase de grupos', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Vice-campeão', 'Campeão'] as const;

export interface CupEvaluation {
  stage: StageValue;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  /** Soma de (resultado - esperado pelo Elo) em cada jogo: positivo = acima do esperado. */
  perf: number;
  /** Etapa esperada para a força do time entre as 32 (0 a 5). */
  expectedStage: number;
  /** Pote (1 a 4) do time na Copa, por força. */
  pot: 1 | 2 | 3 | 4;
  /** Posição por força entre as 32 (1 = mais forte). */
  rank: number;
  champion: boolean;
}

const STAGE_TO_VALUE: Partial<Record<Stage, StageValue>> = { G1: 0, G2: 0, G3: 0, R16: 1, QF: 2, SF: 3, F: 4 };

/** Etapa esperada pela posição de força (rank 1 = mais forte entre as 32). */
export function expectedStage(rank: number): number {
  if (rank <= 2) return 3.6;
  if (rank <= 4) return 3;
  if (rank <= 8) return 2.2;
  if (rank <= 16) return 1.2;
  if (rank <= 24) return 0.6;
  return 0.25;
}

/** Avalia a campanha do usuário numa Copa encerrada (ou eliminada). */
export function evaluateCup(worldIn: World, t: Tournament): CupEvaluation {
  const world = withCustom(worldIn, t.custom);
  const me = t.userNationId;
  const myElo = nationOf(world, me).elo;
  const ranked = t.participants.map((id) => nationOf(world, id)).sort((a, b) => b.elo - a.elo || a.id.localeCompare(b.id));
  const rank = ranked.findIndex((n) => n.id === me) + 1;
  let w = 0, d = 0, l = 0, gf = 0, ga = 0, perf = 0;
  let last: Stage = 'G1';
  for (const r of t.results) {
    if (!r.teams.includes(me)) continue;
    const mine = r.teams[0] === me ? 0 : 1;
    const opp = nationOf(world, r.teams[mine === 0 ? 1 : 0]);
    gf += r.score[mine];
    ga += r.score[mine === 0 ? 1 : 0];
    const knockout = !r.stage.startsWith('G');
    let actual: number;
    if (r.score[0] === r.score[1]) {
      if (knockout) actual = winnerOf(r) === me ? 1 : 0;
      else actual = 0.5;
      if (winnerOf(r) === me && knockout) w++;
      else if (knockout) l++;
      else d++;
    } else if (r.score[mine] > r.score[mine === 0 ? 1 : 0]) {
      actual = 1;
      w++;
    } else {
      actual = 0;
      l++;
    }
    perf += actual - eloExpected(myElo, opp.elo);
    last = r.stage;
  }
  const champion = t.champion === me;
  const stage: StageValue = champion ? 5 : last === 'F' ? 4 : ((STAGE_TO_VALUE[last] ?? 0) as StageValue);
  return { stage, w, d, l, gf, ga, perf, expectedStage: expectedStage(rank), pot: (Math.min(4, Math.floor((rank - 1) / 8) + 1)) as 1 | 2 | 3 | 4, rank, champion };
}

/** Variação da reputação: campanha acima do esperado sobe, fracasso cai. */
export function reputationDelta(ev: CupEvaluation): number {
  const raw = 7 * ev.perf + 5 * (ev.stage - ev.expectedStage) + (ev.champion ? 6 : 0);
  return Math.max(-18, Math.min(30, Math.round(raw)));
}

export const clampRep = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

// ---------- seleções e convites ----------

/** Percentil (0 a 100) do Elo da seleção-era entre todas as seleções-era do mundo. */
export function worldPercentile(world: World, elo: number): number {
  const below = world.nations.filter((n) => n.elo <= elo).length;
  return Math.round((100 * below) / world.nations.length);
}

/** Potes mundiais por força (quartis do Elo entre todas as seleções-era): 1 = os mais fortes. */
export function worldPot(world: World, elo: number): 1 | 2 | 3 | 4 {
  const p = worldPercentile(world, elo);
  return p > 75 ? 1 : p > 50 ? 2 : p > 25 ? 3 : 4;
}

/** 3 seleções sorteadas dos potes 3 e 4 (de países diferentes) para começar a carreira. */
export function careerStartOptions(world: World, seed: number): string[] {
  const pool = world.nations.filter((n) => worldPot(world, n.elo) >= 3);
  const out: string[] = [];
  const codes = new Set<string>();
  for (const n of new Rng(hashSeed(`career-start:${seed}`)).shuffle(pool)) {
    if (codes.has(n.code)) continue;
    codes.add(n.code);
    out.push(n.id);
    if (out.length === 3) break;
  }
  return out;
}

export interface CareerEntry {
  /** Número da Copa na carreira (1, 2, 3...). */
  n: number;
  nationId: string;
  teamLabel: string;
  cut: Cut;
  stage: StageValue;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  champion: boolean;
  pot: 1 | 2 | 3 | 4;
  repBefore: number;
  repAfter: number;
  /** Pontos da campanha (ver scoring.ts), quando calculados. */
  points: number;
}

export interface Career {
  id: string;
  seed: number;
  rep: number;
  entries: CareerEntry[];
  /** Seleção atual (id da seleção-era) e, depois de convocar, o elenco e a escalação para a próxima Copa. */
  nationId?: string;
  called?: string[];
  lineup?: Lineup;
  /** Opções de início de carreira (antes de escolher) e convites pendentes (depois de uma Copa). */
  startOptions?: string[];
  offers?: string[];
}

export function newCareer(world: World, seed: number): Career {
  return { id: `career-${seed}`, seed, rep: START_REPUTATION, entries: [], startOptions: careerStartOptions(world, seed) };
}

/** Quantos convites chegam, conforme o desempenho da última Copa. */
export function offerCount(delta: number, champion: boolean): number {
  if (champion || delta >= 12) return 3;
  if (delta >= 5) return 2;
  if (delta >= -2) return 1;
  return 0;
}

/** Convites compatíveis com a reputação: seleções-era cujo percentil de força fica perto dela. */
export function makeOffers(world: World, rep: number, seed: number, count: number, currentCode?: string): string[] {
  if (count <= 0) return [];
  const lo = rep - 22;
  const hi = rep + 14;
  const pool = world.nations.filter((n) => {
    const p = worldPercentile(world, n.elo);
    return n.code !== currentCode && p >= lo && p <= hi;
  });
  const out: string[] = [];
  const codes = new Set<string>();
  for (const n of new Rng(hashSeed(`offers:${seed}`)).shuffle(pool)) {
    if (codes.has(n.code)) continue;
    codes.add(n.code);
    out.push(n.id);
    if (out.length >= count) break;
  }
  return out;
}

/** Registra a Copa na carreira: atualiza a reputação, guarda no histórico e prepara os convites. */
export function applyCup(world: World, career: Career, t: Tournament, ev: CupEvaluation, points = 0): Career {
  const nation = nationOf(withCustom(world, t.custom), t.userNationId);
  const delta = reputationDelta(ev);
  const repAfter = clampRep(career.rep + delta);
  const entry: CareerEntry = {
    n: career.entries.length + 1,
    nationId: nation.id,
    teamLabel: nation.country,
    cut: t.cut,
    stage: ev.stage,
    w: ev.w,
    d: ev.d,
    l: ev.l,
    gf: ev.gf,
    ga: ev.ga,
    champion: ev.champion,
    pot: ev.pot,
    repBefore: career.rep,
    repAfter,
    points,
  };
  const offers = makeOffers(world, repAfter, career.seed + entry.n * 7919, offerCount(delta, ev.champion), nation.code);
  return { ...career, rep: repAfter, entries: [...career.entries, entry], offers, called: undefined, lineup: career.lineup };
}

/** Escolhe a seleção atual (início de carreira ou convite aceito). */
export function takeTeam(career: Career, nationId: string): Career {
  return { ...career, nationId, called: undefined, lineup: undefined, startOptions: undefined, offers: undefined };
}

/** Recorte da Copa da carreira: a década da seleção (adversários da mesma época), ou todas as eras se a década for pequena demais. */
export function careerCut(world: World, n: NationEra): Cut {
  const countries = new Set(world.nations.filter((x) => x.decade === n.decade).map((x) => x.code));
  return countries.size >= 32 ? n.decade : 'all';
}

export interface CareerSummary {
  cups: number;
  titles: number;
  /** Melhor campanha (mais longe; empate: mais vitórias). */
  best?: CareerEntry;
  teams: { label: string; cups: number }[];
}

export function summarizeCareer(c: Career): CareerSummary {
  const best = [...c.entries].sort((a, b) => b.stage - a.stage || b.w - a.w || b.gf - b.ga - (a.gf - a.ga))[0];
  const teams = new Map<string, number>();
  for (const e of c.entries) teams.set(e.teamLabel, (teams.get(e.teamLabel) ?? 0) + 1);
  return { cups: c.entries.length, titles: c.entries.filter((e) => e.champion).length, best, teams: [...teams].map(([label, cups]) => ({ label, cups })) };
}

