import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCalibration } from '../src/engine/calibration';
import type { Params } from '../src/engine/params';
import type { World } from '../src/engine/types';

const world = JSON.parse(readFileSync(resolve(import.meta.dirname, '../data/world.json'), 'utf8')) as World;
const games = Number(process.argv[2] ?? 20000);
// overrides opcionais por JSON: npm run calibrate -- 20000 '{"k":3}'
const overrides = (process.argv[3] ? JSON.parse(process.argv[3]) : {}) as Partial<Params>;

const t0 = performance.now();
const r = runCalibration(world, games, overrides);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

console.log(`\nCalibração: ${r.games} jogos em campo neutro (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
console.log(`Gols/jogo: ${r.goalsPerGame.toFixed(2)}   (alvo 2,5 a 2,8)`);
console.log(`Empates:   ${pct(r.drawRate)}   (alvo 23% a 28%)`);
console.log(`xG/jogo:   ${r.xgPerGame.toFixed(2)}   Finalizações/jogo: ${r.shotsPerGame.toFixed(1)}`);
console.log('\nMais forte por faixa de diferença de Elo:');
console.table(
  r.bands.map((b) => ({
    'dif. Elo': b.label,
    jogos: b.games,
    'mais forte vence': pct(b.strongWins),
    empate: pct(b.draws),
    zebra: pct(b.upsets),
    'pontos simulados': b.score.toFixed(3),
    'pontos pelo Elo': b.eloScore.toFixed(3),
    'gols/jogo': b.goals.toFixed(2),
  })),
);
console.log('Mesma década (alvo: a até 0,3 da média real):');
console.table(r.decades.map((d) => ({ década: d.decade, simulado: d.goals.toFixed(2), real: d.real.toFixed(2), diferença: d.diff.toFixed(2), ok: Math.abs(d.diff) <= 0.3 ? 'sim' : 'NÃO' })));
