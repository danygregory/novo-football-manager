import { RECOVERY_PER_DAY } from './fatigue';
import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import { simulateMatch, type TeamSetup } from './match';
import { Rng, hashSeed } from './prng';
import type { Lineup, MatchReport, NationEra, Player, World } from './types';

/** Copa do Mundo: 8 grupos de 4, os 2 primeiros avançam; oitavas, quartas, semifinais e final. */
export type Stage = 'G1' | 'G2' | 'G3' | 'R16' | 'QF' | 'SF' | 'F' | 'DONE';

export const STAGE_ORDER: Stage[] = ['G1', 'G2', 'G3', 'R16', 'QF', 'SF', 'F', 'DONE'];

export const STAGE_LABEL: Record<Stage, string> = {
  G1: 'Fase de grupos · 1ª rodada',
  G2: 'Fase de grupos · 2ª rodada',
  G3: 'Fase de grupos · 3ª rodada',
  R16: 'Oitavas de final',
  QF: 'Quartas de final',
  SF: 'Semifinais',
  F: 'Final',
  DONE: 'Copa encerrada',
};

export interface Fixture {
  id: string;
  stage: Stage;
  home: string;
  away: string;
}

export interface GoalRecord {
  playerId: string;
  team: string;
  minute: number;
}

export interface MatchResult {
  id: string;
  stage: Stage;
  teams: [string, string];
  score: [number, number];
  shootout?: [number, number];
  extraTime: boolean;
  goals: GoalRecord[];
}

export interface Tournament {
  seed: number;
  userNationId: string;
  /** Convocados (ids) de cada seleção. */
  squads: Record<string, string[]>;
  userLineup: Lineup;
  /** Condição atual de cada convocado. */
  cond: Record<string, number>;
  groups: string[][];
  results: MatchResult[];
  /** Próxima etapa a ser jogada. */
  stage: Stage;
  /** Soma de (nota) e jogos por jogador, e gols. */
  stats: { goals: Record<string, number>; ratingSum: Record<string, number>; apps: Record<string, number> };
  champion?: string;
}

export interface Standing {
  id: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

const DAYS_BETWEEN_ROUNDS = 3;

// ---------- consultas ----------

export function nationOf(world: World, id: string): NationEra {
  const n = world.nations.find((x) => x.id === id);
  if (!n) throw new Error(`Seleção desconhecida: ${id}`);
  return n;
}

export function playerIndex(world: World): Map<string, Player & { nationId: string }> {
  const out = new Map<string, Player & { nationId: string }>();
  for (const n of world.nations) for (const p of n.squad) out.set(p.id, { ...p, nationId: n.id });
  return out;
}

export function winnerOf(r: MatchResult): string {
  if (r.score[0] !== r.score[1]) return r.score[0] > r.score[1] ? r.teams[0] : r.teams[1];
  if (r.shootout) return r.shootout[0] > r.shootout[1] ? r.teams[0] : r.teams[1];
  return r.teams[0];
}

const GROUP_PAIRINGS: [number, number][][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [3, 1]],
  [[3, 0], [1, 2]],
];

export function standings(t: Tournament, groupIndex: number, world: World): Standing[] {
  const ids = t.groups[groupIndex] as string[];
  const table = new Map<string, Standing>(ids.map((id) => [id, { id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }]));
  for (const r of t.results) {
    if (!r.stage.startsWith('G')) continue;
    const a = table.get(r.teams[0]);
    const b = table.get(r.teams[1]);
    if (!a || !b) continue;
    a.played++; b.played++;
    a.gf += r.score[0]; a.ga += r.score[1];
    b.gf += r.score[1]; b.ga += r.score[0];
    if (r.score[0] > r.score[1]) { a.won++; b.lost++; a.points += 3; }
    else if (r.score[0] < r.score[1]) { b.won++; a.lost++; b.points += 3; }
    else { a.drawn++; b.drawn++; a.points++; b.points++; }
  }
  const strength = (id: string) => nationOf(world, id).elo;
  return [...table.values()]
    .map((s) => ({ ...s, gd: s.gf - s.ga }))
    .sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || strength(y.id) - strength(x.id) || x.id.localeCompare(y.id));
}

function stageResults(t: Tournament, stage: Stage): MatchResult[] {
  return t.results.filter((r) => r.stage === stage);
}

/** Jogos da etapa atual (vazio se a Copa acabou). */
export function currentFixtures(t: Tournament, world: World): Fixture[] {
  const st = t.stage;
  if (st === 'DONE') return [];
  if (st === 'G1' || st === 'G2' || st === 'G3') {
    const md = STAGE_ORDER.indexOf(st);
    const out: Fixture[] = [];
    t.groups.forEach((ids, g) => {
      (GROUP_PAIRINGS[md] as [number, number][]).forEach(([i, j], n) => {
        out.push({ id: `${st}-${String.fromCharCode(65 + g)}${n + 1}`, stage: st, home: ids[i] as string, away: ids[j] as string });
      });
    });
    return out;
  }
  if (st === 'R16') {
    const first = (g: number) => standings(t, g, world)[0]!.id;
    const second = (g: number) => standings(t, g, world)[1]!.id;
    // 1A-2B, 1C-2D, 1E-2F, 1G-2H, 1B-2A, 1D-2C, 1F-2E, 1H-2G
    const pairs: [string, string][] = [
      [first(0), second(1)], [first(2), second(3)], [first(4), second(5)], [first(6), second(7)],
      [first(1), second(0)], [first(3), second(2)], [first(5), second(4)], [first(7), second(6)],
    ];
    return pairs.map(([home, away], i) => ({ id: `R16-${i + 1}`, stage: 'R16', home, away }));
  }
  const prev: Stage = st === 'QF' ? 'R16' : st === 'SF' ? 'QF' : 'SF';
  const winners = stageResults(t, prev).map(winnerOf);
  const out: Fixture[] = [];
  for (let i = 0; i + 1 < winners.length; i += 2) {
    out.push({ id: `${st}-${i / 2 + 1}`, stage: st, home: winners[i] as string, away: winners[i + 1] as string });
  }
  return out;
}

export function userFixture(t: Tournament, world: World): Fixture | undefined {
  return currentFixtures(t, world).find((f) => f.home === t.userNationId || f.away === t.userNationId);
}

export function userStatus(t: Tournament, world: World): 'alive' | 'eliminated' | 'champion' {
  if (t.champion === t.userNationId) return 'champion';
  if (t.stage === 'DONE') return 'eliminated';
  return userFixture(t, world) ? 'alive' : 'eliminated';
}

export function fixtureSeed(t: Tournament, f: Fixture): number {
  return hashSeed(`${t.seed}:${f.id}`);
}

/** Jogadores de uma seleção, com a condição atual do torneio. */
export function squadWithCondition(world: World, t: Tournament, nationId: string): Player[] {
  const ids = new Set(t.squads[nationId] as string[]);
  return nationOf(world, nationId)
    .squad.filter((p) => ids.has(p.id))
    .map((p) => ({ ...p, condition: t.cond[p.id] ?? p.condition }));
}

/** Time pronto para jogar: o do usuário usa a escalação salva; os demais, a IA. */
export function buildSetup(world: World, t: Tournament, nationId: string, forUser: boolean): TeamSetup {
  const nation = nationOf(world, nationId);
  const squad = squadWithCondition(world, t, nationId);
  const goalRate = world.decades.find((d) => d.decade === nation.decade)?.goalsPerMatchCompetitive;
  if (forUser) {
    return { nationId, name: nation.country, squad, lineup: t.userLineup, ai: false, goalRate };
  }
  return { nationId, name: nation.country, squad, lineup: autoLineup(nationId, squad, tacticsForStyle(nation.playStyle)), ai: true, goalRate };
}

// ---------- criação ----------

export function createTournament(world: World, userNationId: string, userSquad: string[], userLineup: Lineup, seed: number): Tournament {
  const rng = new Rng(hashSeed(`cup:${seed}`));
  // potes por Elo: um time de cada pote em cada grupo; o do usuário entra normalmente no sorteio.
  const sorted = [...world.nations].sort((a, b) => b.elo - a.elo || a.id.localeCompare(b.id));
  const pots = [0, 1, 2, 3].map((p) => sorted.slice(p * 8, p * 8 + 8).map((n) => n.id));
  const shuffled = pots.map((pot) => rng.shuffle(pot));
  const groups = Array.from({ length: 8 }, (_, g) => shuffled.map((pot) => pot[g] as string));
  groups.forEach((ids, g) => (groups[g] = rng.shuffle(ids)));

  const squads: Record<string, string[]> = {};
  const cond: Record<string, number> = {};
  for (const n of world.nations) {
    const ids = n.id === userNationId ? userSquad : autoLineupSquadIds(n);
    squads[n.id] = ids;
    for (const p of n.squad) if (ids.includes(p.id)) cond[p.id] = p.condition;
  }
  return {
    seed,
    userNationId,
    squads,
    userLineup,
    cond,
    groups,
    results: [],
    stage: 'G1',
    stats: { goals: {}, ratingSum: {}, apps: {} },
  };
}

function autoLineupSquadIds(n: NationEra): string[] {
  return autoSquad23(n.squad).map((p) => p.id);
}

// ---------- rodada ----------

function toResult(f: Fixture, r: MatchReport): MatchResult {
  const goals: GoalRecord[] = r.events
    .filter((e) => e.type === 'goal' && e.playerId)
    .map((e) => ({ playerId: e.playerId as string, team: r.teams[e.team], minute: e.minute }));
  return { id: f.id, stage: f.stage, teams: [f.home, f.away], score: r.score, shootout: r.shootout, extraTime: r.extraTime, goals };
}

export interface RoundOutcome {
  tournament: Tournament;
  results: MatchResult[];
}

/**
 * Encerra a rodada atual. Se o usuário ainda está vivo, `userReport` (da partida que ele jogou, ao vivo ou
 * instantânea) é obrigatório; os outros jogos são simulados pela IA com seeds fixas por jogo.
 */
export function playRound(world: World, tournament: Tournament, userReport?: MatchReport): RoundOutcome {
  const t: Tournament = structuredClone(tournament);
  const fixtures = currentFixtures(t, world);
  const mine = fixtures.find((f) => f.home === t.userNationId || f.away === t.userNationId);
  if (mine && !userReport) throw new Error('Falta a partida do usuário nesta rodada.');
  const knockout = !t.stage.startsWith('G');
  const results: MatchResult[] = [];
  const newCond: Record<string, number> = {};

  for (const f of fixtures) {
    let report: MatchReport;
    if (f === mine && userReport) report = userReport;
    else {
      report = simulateMatch([buildSetup(world, t, f.home, false), buildSetup(world, t, f.away, false)], {
        seed: fixtureSeed(t, f),
        knockout,
        detail: 'summary',
      });
    }
    const res = toResult(f, report);
    results.push(res);
    for (const [id, c] of Object.entries(report.finalCondition)) newCond[id] = c;
    for (const [id, r] of Object.entries(report.ratings)) {
      t.stats.ratingSum[id] = (t.stats.ratingSum[id] ?? 0) + r;
      t.stats.apps[id] = (t.stats.apps[id] ?? 0) + 1;
    }
    for (const g of res.goals) t.stats.goals[g.playerId] = (t.stats.goals[g.playerId] ?? 0) + 1;
  }

  // condição: valor final das partidas + recuperação para todos os convocados
  for (const id of Object.keys(t.cond)) {
    const base = newCond[id] ?? (t.cond[id] as number);
    t.cond[id] = Math.min(100, Math.round((base + RECOVERY_PER_DAY * DAYS_BETWEEN_ROUNDS) * 10) / 10);
  }
  t.results.push(...results);
  t.stage = STAGE_ORDER[STAGE_ORDER.indexOf(t.stage) + 1] as Stage;
  if (t.stage === 'DONE') {
    const final = t.results.find((r) => r.stage === 'F');
    if (final) t.champion = winnerOf(final);
  }
  return { tournament: t, results };
}

/** Simula tudo o que falta quando o usuário já foi eliminado. */
export function playRemaining(world: World, tournament: Tournament): Tournament {
  let t = tournament;
  while (t.stage !== 'DONE') {
    if (userFixture(t, world)) throw new Error('O usuário ainda está na Copa.');
    t = playRound(world, t).tournament;
  }
  return t;
}

// ---------- prêmios ----------

export interface Awards {
  topScorer?: { playerId: string; goals: number };
  bestPlayer?: { playerId: string; avg: number; apps: number };
}

export function awards(t: Tournament): Awards {
  const goals = Object.entries(t.stats.goals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // melhor jogador: maior saldo acumulado sobre a nota 6 (premia regularidade), desempate pela média.
  const rated = Object.entries(t.stats.ratingSum)
    .map(([id, sum]) => {
      const apps = t.stats.apps[id] ?? 1;
      return { id, apps, avg: sum / apps, score: sum - 6 * apps };
    })
    .sort((a, b) => b.score - a.score || b.avg - a.avg || a.id.localeCompare(b.id));
  const g = goals[0];
  const b = rated[0];
  return {
    topScorer: g ? { playerId: g[0], goals: g[1] } : undefined,
    bestPlayer: b ? { playerId: b.id, avg: Math.round(b.avg * 100) / 100, apps: b.apps } : undefined,
  };
}
