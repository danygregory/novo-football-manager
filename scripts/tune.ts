import { readFileSync, writeFileSync } from 'node:fs';
import { runCalibration } from '../src/engine/calibration';
import { DEFAULT_PARAMS, type Params } from '../src/engine/params';
import type { World } from '../src/engine/types';

const world = JSON.parse(readFileSync('data/world.json', 'utf8')) as World;
/**
 * Ajuste automático (busca por coordenadas) dos parâmetros do motor contra os alvos da calibração.
 * Uso: npx tsx scripts/tune.ts ['{"k":1.5,...}']  (JSON opcional com o ponto de partida; STEP=0.1 define o passo).
 * Os valores achados são copiados à mão para DEFAULT_PARAMS e registrados em docs/CALIBRACAO.md.
 */
const BASE_XG = { trabalhada: 0.11, 'contra-ataque': 0.2, cruzamento: 0.075, 'bola-parada': 0.06 };
/** Alvos reais: jogos 1950+ sem amistosos entre seleções com Elo >= 1650, por faixa de diferença de Elo. */
const REAL_PTS = [0.547, 0.648, 0.714, 0.709, 0.818];
const REAL_GOALS = [2.44, 2.51, 2.6, 2.54, 2.89];
/** Mundo inteiro (todas as seleções-era, jogos reais de 1930 em diante sem amistosos). */
const WORLD_PTS = [0.553, 0.649, 0.711, 0.759, 0.859];
const WORLD_GOALS = [2.55, 2.68, 2.8, 2.93, 3.72];
const REAL_TOL = [0.03, 0.03, 0.035, 0.05, 0.08];

interface Knobs { k: number; xgScale: number; step: number; slope: number; counter: number; longBall: number; base: number; advDEF: number; advMID: number; advATT: number; eraExp: number; qualityExp: number }
const toParams = (x: Knobs): Partial<Params> => ({
  k: x.k,
  eraExp: x.eraExp,
  qualityExp: x.qualityExp,
  baseGoalRate: x.base,
  stepMinutes: x.step,
  counterBase: x.counter,
  longBallBase: x.longBall,
  advance0: { DEF: x.advDEF, MID: x.advMID, ATT: x.advATT },
  conv: { ...DEFAULT_PARAMS.conv, slope: x.slope },
  xg: {
    trabalhada: BASE_XG.trabalhada * x.xgScale,
    'contra-ataque': BASE_XG['contra-ataque'] * x.xgScale,
    cruzamento: BASE_XG.cruzamento * x.xgScale,
    'bola-parada': BASE_XG['bola-parada'] * x.xgScale,
    penalti: DEFAULT_PARAMS.xg.penalti,
  },
});

function loss(x: Knobs, games: number, decadeGames: number) {
  const r = runCalibration(world, games, toParams(x), 2026, decadeGames);
  let l = 0;
  l += ((r.goalsPerGame - 2.65) / 0.08) ** 2;
  l += ((r.drawRate - 0.265) / 0.015) ** 2;
  l += ((r.shotsPerGame - 26) / 3) ** 2;
  r.bands.forEach((b, i) => {
    l += ((b.score - REAL_PTS[i]!) / REAL_TOL[i]!) ** 2;
    l += ((b.goals - REAL_GOALS[i]!) / 0.25) ** 2;
  });
  for (const d of r.decades) l += (d.diff / 0.15) ** 2;
  r.world.bands.forEach((b, i) => {
    l += 0.5 * ((b.score - WORLD_PTS[i]!) / 0.04) ** 2;
    l += 0.5 * ((b.goals - WORLD_GOALS[i]!) / 0.3) ** 2;
  });
  return { l, r };
}

let x: Knobs = JSON.parse(process.argv[2] ?? 'null') ?? { k: 1.597, xgScale: 0.786348, step: 0.3792, slope: 0.00735, counter: 0.0694, longBall: 0.1006, base: 2.65, advDEF: 0.92, advMID: 0.609, advATT: 0.42, eraExp: 0.732, qualityExp: 0.4496 };
const lo: Partial<Knobs> = { eraExp: 0.3, qualityExp: 0.2, k: 0.5, xgScale: 0.3, step: 0.3, slope: 0.005, counter: 0.02, longBall: 0.02, base: 1.5, advDEF: 0.6, advMID: 0.45, advATT: 0.25 };
const hi: Partial<Knobs> = { eraExp: 1.0, qualityExp: 1.5, k: 4, xgScale: 1.6, step: 1.2, slope: 0.08, counter: 0.3, longBall: 0.3, base: 4, advDEF: 0.92, advMID: 0.85, advATT: 0.65 };
let best = loss(x, 5000, 400);
console.log('inicio', best.l.toFixed(1));
const keys = Object.keys(x) as (keyof Knobs)[];
let stepSize = Number(process.env.STEP ?? 0.12);
for (let round = 0; round < 6; round++) {
  let improved = false;
  for (const key of keys) {
    for (const dir of [1, -1]) {
      const cand = { ...x, [key]: Math.min(hi[key]!, Math.max(lo[key]!, x[key] * (1 + dir * stepSize))) } as Knobs;
      if (cand[key] === x[key]) continue;
      const c = loss(cand, 5000, 400);
      if (c.l < best.l) { best = c; x = cand; improved = true; console.log(round, key, x[key].toFixed(4), c.l.toFixed(1)); break; }
    }
  }
  if (!improved) stepSize /= 2;
  writeFileSync('tune-best.json', JSON.stringify(x));
}
console.log(JSON.stringify(x));
