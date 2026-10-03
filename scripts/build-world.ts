import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld } from '../src/data/world';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const csv = readFileSync(resolve(root, 'data/raw/results.csv'), 'utf8');
const world = buildWorld(csv);
const out = resolve(root, 'data/world.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(world, null, 1) + '\n');

console.log(`world.json: ${world.nations.length} seleções-era, ${world.nations.length * 40} jogadores`);
console.table(
  world.decades.map((d) => ({ década: d.decade, jogos: d.matches, 'gols/jogo': d.goalsPerMatch, 'gols/jogo (comp.)': d.goalsPerMatchCompetitive, 'Elo médio': d.meanElo })),
);
console.table(
  world.nations.map((n) => ({ id: n.id, país: n.country, cont: n.continent, elo: n.elo, estilo: n.playStyle, gf: n.goalsFor, gc: n.goalsAgainst })),
);
