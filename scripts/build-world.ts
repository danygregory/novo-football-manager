import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MIN_MATCHES, buildWorldAndSummaries } from '../src/data/world';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// npm run build-world -- --min=20  (mínimo de jogos da seleção na década; padrão 15)
const minArg = process.argv.find((a) => a.startsWith('--min='));
const min = minArg ? Number(minArg.slice(6)) : DEFAULT_MIN_MATCHES;
const csv = readFileSync(resolve(root, 'data/raw/results.csv'), 'utf8');
const { world, summaries } = buildWorldAndSummaries(csv, min);
const out = resolve(root, 'data/world.json');
mkdirSync(dirname(out), { recursive: true });
// uma linha por seleção-era: arquivo leve e com diff legível
const body = JSON.stringify({ ...world, nations: undefined }, null, 1).replace(/\n}\s*$/, '');
const text = `${body.replace(/,?\n?$/, '')},\n "nations": [\n${world.nations.map((n) => '  ' + JSON.stringify(n)).join(',\n')}\n ]\n}\n`;
writeFileSync(out, text);
// resumos factuais num arquivo à parte: o motor (worker) e a tela inicial não precisam deles
const summariesText = `{\n${Object.entries(summaries).map(([id, v]) => ` ${JSON.stringify(id)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;
writeFileSync(resolve(root, 'data/summaries.json'), summariesText);

console.log(`world.json: ${world.nations.length} seleções-era (mínimo de ${min} jogos na década), ${(text.length / 1024).toFixed(0)} KB; summaries.json: ${(summariesText.length / 1024).toFixed(0)} KB`);
const byDecade = new Map<number, number>();
const byContinent = new Map<string, number>();
for (const n of world.nations) {
  byDecade.set(n.decade, (byDecade.get(n.decade) ?? 0) + 1);
  byContinent.set(n.continent, (byContinent.get(n.continent) ?? 0) + 1);
}
console.table(
  world.decades.map((d) => ({ década: d.decade, 'seleções-era': byDecade.get(d.decade) ?? 0, jogos: d.matches, 'gols/jogo': d.goalsPerMatch, 'gols/jogo (comp.)': d.goalsPerMatchCompetitive, 'Elo médio': d.meanElo })),
);
console.table(Object.fromEntries([...byContinent].sort()));
