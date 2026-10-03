import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import { simulateMatch, type TeamSetup } from './match';
import type { Params } from './params';
import { Rng } from './prng';
import type { NationEra, World } from './types';

/** Probabilidade esperada (pontos: V=1, E=0,5) do Elo `a` contra `b` em campo neutro. */
export function eloExpected(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
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

export interface CalibrationResult {
  games: number;
  goalsPerGame: number;
  drawRate: number;
  xgPerGame: number;
  shotsPerGame: number;
  bands: BandResult[];
  decades: { decade: number; games: number; goals: number; real: number; diff: number }[];
}

export function buildSetups(world: World): Map<string, TeamSetup> {
  const decadeRate = new Map(world.decades.map((d) => [d.decade, d.goalsPerMatchCompetitive]));
  const out = new Map<string, TeamSetup>();
  for (const n of world.nations) {
    const squad = autoSquad23(n.squad);
    out.set(n.id, {
      nationId: n.id,
      name: n.country,
      squad,
      lineup: autoLineup(n.id, squad, tacticsForStyle(n.playStyle)),
      ai: true,
      goalRate: decadeRate.get(n.decade),
    });
  }
  return out;
}

/** Simula `games` partidas em campo neutro entre seleções-era sorteadas e agrega as métricas de calibração. */
export function runCalibration(world: World, games: number, params: Partial<Params> = {}, seed = 2026, decadeGames = 1500): CalibrationResult {
  const setups = buildSetups(world);
  const nations = world.nations;
  const rng = new Rng(seed);
  const acc = BANDS.map(() => ({ games: 0, sw: 0, dr: 0, up: 0, pts: 0, elo: 0, goals: 0 }));
  let goals = 0, draws = 0, xg = 0, shots = 0;

  for (let i = 0; i < games; i++) {
    const a = rng.pick(nations);
    let b = rng.pick(nations);
    while (b === a) b = rng.pick(nations);
    const r = simulateMatch([setups.get(a.id) as TeamSetup, setups.get(b.id) as TeamSetup], { seed: (seed * 7919 + i) >>> 0, detail: 'summary', params });
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

  const decades = world.decades.map((d) => {
    const pool = nations.filter((n: NationEra) => n.decade === d.decade);
    const drng = new Rng(seed + d.decade);
    let g = 0;
    for (let i = 0; i < decadeGames; i++) {
      const a = drng.pick(pool);
      let b = drng.pick(pool);
      while (b === a) b = drng.pick(pool);
      const r = simulateMatch([setups.get(a.id) as TeamSetup, setups.get(b.id) as TeamSetup], { seed: (seed + d.decade) * 31 + i, detail: 'summary', params });
      g += r.score[0] + r.score[1];
    }
    const mean = g / decadeGames;
    return { decade: d.decade, games: decadeGames, goals: mean, real: d.goalsPerMatchCompetitive, diff: mean - d.goalsPerMatchCompetitive };
  });

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
    decades,
  };
}
