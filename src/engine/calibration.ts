import { COMPETITIVE_ELO } from '../data/elo';
import { squadOf } from '../data/squads';
import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import { simulateMatch, type TeamSetup } from './match';
import type { Params } from './params';
import { Rng } from './prng';
import type { NationEra, World } from './types';
import { pow as dpow } from './dmath';

/** Probabilidade esperada (pontos: V=1, E=0,5) do Elo `a` contra `b` em campo neutro. */
export function eloExpected(a: number, b: number): number {
  return 1 / (1 + dpow(10, (b - a) / 400));
}

export const BANDS: [number, number][] = [
  [0, 100],
  [100, 200],
  [200, 300],
  [300, 400],
  [400, 1000],
];

export interface BandResult {
  label: string;
  games: number;
  strongWins: number;
  draws: number;
  upsets: number;
  /** Pontos do mais forte (V=1, E=0,5) / jogos. */
  score: number;
  /** Pontos esperados pelo Elo médio da faixa. */
  eloScore: number;
  goals: number;
}

export interface PoolResult {
  games: number;
  goalsPerGame: number;
  drawRate: number;
  xgPerGame: number;
  shotsPerGame: number;
  bands: BandResult[];
}

export interface CalibrationResult extends PoolResult {
  /** Mesma-década: só décadas com pelo menos 8 seleções-era no nível da Copa (Elo >= 1650). */
  decades: { decade: number; games: number; goals: number; real: number; diff: number }[];
  /** O mundo inteiro (todas as seleções-era, inclusive as fracas): comparado com todos os jogos reais da base. */
  world: PoolResult;
}

/** Elo mínimo das seleções-era do "nível da Copa", a população da calibração principal (as metas do prompt). */
export const CUP_LEVEL_ELO = COMPETITIVE_ELO;

/** Setups sob demanda (com 500+ seleções-era, gerar todos os elencos de antemão seria desperdício). */
export function buildSetups(world: World): { get(id: string): TeamSetup } {
  const decadeRate = new Map(world.decades.map((d) => [d.decade, d.goalsPerMatchCompetitive]));
  const byId = new Map(world.nations.map((n) => [n.id, n]));
  const cache = new Map<string, TeamSetup>();
  return {
    get(id: string): TeamSetup {
      let s = cache.get(id);
      if (!s) {
        const n = byId.get(id) as NationEra;
        const squad = autoSquad23(squadOf(n));
        s = { nationId: n.id, name: n.country, squad, lineup: autoLineup(n.id, squad, tacticsForStyle(n.playStyle)), ai: true, goalRate: decadeRate.get(n.decade) };
        cache.set(id, s);
      }
      return s;
    },
  };
}

function poolStats(setups: { get(id: string): TeamSetup }, nations: NationEra[], games: number, seed: number, params: Partial<Params>): PoolResult {
  const rng = new Rng(seed);
  const acc = BANDS.map(() => ({ games: 0, sw: 0, dr: 0, up: 0, pts: 0, elo: 0, goals: 0 }));
  let goals = 0, draws = 0, xg = 0, shots = 0;
  for (let i = 0; i < games; i++) {
    const a = rng.pick(nations);
    let b = rng.pick(nations);
    while (b === a) b = rng.pick(nations);
    const r = simulateMatch([setups.get(a.id), setups.get(b.id)], { seed: (seed * 7919 + i) >>> 0, detail: 'summary', params });
    const total = r.score[0] + r.score[1];
    goals += total;
    xg += r.stats[0].xg + r.stats[1].xg;
    shots += r.stats[0].shots + r.stats[1].shots;
    if (r.score[0] === r.score[1]) draws++;
    const strongIs0 = a.elo >= b.elo;
    const strong = strongIs0 ? r.score[0] : r.score[1];
    const weak = strongIs0 ? r.score[1] : r.score[0];
    const diff = Math.abs(a.elo - b.elo);
    const bi = BANDS.findIndex(([lo, hi]) => diff >= lo && diff < hi);
    const band = acc[bi];
    if (!band) continue;
    band.games++;
    band.goals += total;
    band.elo += eloExpected(Math.max(a.elo, b.elo), Math.min(a.elo, b.elo));
    if (strong > weak) {
      band.sw++;
      band.pts += 1;
    } else if (strong === weak) {
      band.dr++;
      band.pts += 0.5;
    } else band.up++;
  }
  return {
    games,
    goalsPerGame: goals / games,
    drawRate: draws / games,
    xgPerGame: xg / games,
    shotsPerGame: shots / games,
    bands: acc.map((x, i) => ({
      label: `${(BANDS[i] as [number, number])[0]}-${(BANDS[i] as [number, number])[1] >= 1000 ? '+' : (BANDS[i] as [number, number])[1]}`,
      games: x.games,
      strongWins: x.games ? x.sw / x.games : 0,
      draws: x.games ? x.dr / x.games : 0,
      upsets: x.games ? x.up / x.games : 0,
      score: x.games ? x.pts / x.games : 0,
      eloScore: x.games ? x.elo / x.games : 0,
      goals: x.games ? x.goals / x.games : 0,
    })),
  };
}

/**
 * Simula `games` partidas em campo neutro e agrega as métricas.
 * A população principal é o "nível da Copa" (seleções-era com Elo >= 1650), comparável aos jogos reais entre seleções desse nível;
 * o mundo inteiro (`world`) é simulado à parte, com metade dos jogos, para checar o comportamento contra seleções fracas.
 */
export function runCalibration(world: World, games: number, params: Partial<Params> = {}, seed = 2026, decadeGames = 1500): CalibrationResult {
  const setups = buildSetups(world);
  const cup = world.nations.filter((n) => n.elo >= CUP_LEVEL_ELO);
  const main = poolStats(setups, cup, games, seed, params);
  const all = poolStats(setups, world.nations, Math.round(games / 2), seed + 1, params);

  const decades = world.decades
    .map((d) => ({ d, pool: cup.filter((n) => n.decade === d.decade) }))
    .filter(({ pool }) => pool.length >= 8)
    .map(({ d, pool }) => {
      const drng = new Rng(seed + d.decade);
      let g = 0;
      for (let i = 0; i < decadeGames; i++) {
        const a = drng.pick(pool);
        let b = drng.pick(pool);
        while (b === a) b = drng.pick(pool);
        const r = simulateMatch([setups.get(a.id), setups.get(b.id)], { seed: (seed + d.decade) * 31 + i, detail: 'summary', params });
        g += r.score[0] + r.score[1];
      }
      const mean = g / decadeGames;
      return { decade: d.decade, games: decadeGames, goals: mean, real: d.goalsPerMatchCompetitive, diff: mean - d.goalsPerMatchCompetitive };
    });

  return { ...main, decades, world: all };
}
