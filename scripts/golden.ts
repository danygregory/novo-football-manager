import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Rede de segurança para refatorações do motor: simula 120 partidas (com e sem comandos, mata-mata, detalhe completo e resumo)
 * e compara o hash de cada relatório com o baseline em data/golden-engine.txt. Refatoração que não muda comportamento deixa
 * tudo idêntico. Mudou o motor de propósito (parâmetros, regras)? Rode com --update para gravar o novo baseline.
 * Uso: npm run golden [-- --update]
 */
import { ENGINE_VERSION, autoLineup, autoSquad23, tacticsForStyle, simulateMatch, MatchSimulator, type TeamSetup, type World } from '../src/engine';
import { squadOf } from '../src/data/squads';
const world = JSON.parse(readFileSync('data/world.json', 'utf8')) as World;
const mk = (id: string, ai: boolean): TeamSetup => { const n = world.nations.find((x) => x.id === id)!; const squad = autoSquad23(squadOf(n)); return { nationId: id, name: n.country, squad, lineup: autoLineup(id, squad, tacticsForStyle(n.playStyle)), ai }; };
const ids = ['BRA-1970', 'GER-1980', 'ARG-2020', 'HUN-1954-1957', 'HAI-1970', 'ESP-2010', 'URS-1960', 'JPN-2000'].filter((id) => world.nations.some((n) => n.id === id));
const out: string[] = [];
let k = 0;
for (let seed = 0; seed < 120; seed++) {
  const a = ids[seed % ids.length]!, b = ids[(seed * 3 + 1) % ids.length]!;
  const human = seed % 3 === 0;
  const r = simulateMatch([mk(a, !human), mk(b, true)], { seed, knockout: seed % 2 === 0, detail: seed % 5 === 0 ? 'summary' : 'full' });
  out.push(createHash('sha1').update(JSON.stringify(r)).digest('hex').slice(0, 12)); k++;
}
// partida em pedaços com comandos
const sim = new MatchSimulator([mk('BRA-1970', false), mk('GER-1980', true)], { seed: 99, knockout: true });
sim.playUntil(12.3); sim.execute({ kind: 'shout', side: 0, shout: 'press' }); sim.playUntil(80); sim.execute({ kind: 'talk', side: 0, tone: 'demand' });
out.push(createHash('sha1').update(JSON.stringify(sim.playToEnd())).digest('hex').slice(0, 12));
const BASE = 'data/golden-engine.txt';
const HEADER = `# engine-version ${ENGINE_VERSION}`;
if (process.argv.includes('--update') || !existsSync(BASE)) {
  writeFileSync(BASE, [HEADER, ...out].join('\n'));
  console.log(`baseline gravado: ${out.length} partidas`);
} else {
  const [header, ...base] = readFileSync(BASE, 'utf8').split('\n');
  if (header !== HEADER) {
    console.log(`Baseline gravado na versão do motor diferente (${header} x ${HEADER}): rode com --update ao subir ENGINE_VERSION.`);
    process.exit(1);
  }
  const diffs = out.map((h, i) => (h === base[i] ? -1 : i)).filter((i) => i >= 0);
  console.log(diffs.length === 0 ? `OK: ${out.length} partidas idênticas ao baseline` : `DIFERENTE em ${diffs.length} partidas (primeiras: ${diffs.slice(0, 8).join(', ')}). Mudança de propósito? Suba ENGINE_VERSION e rode --update.`);
  if (diffs.length) {
    process.exitCode = 1;
    // no CI, vira anotação legível pela API (os logs só abrem com login): versão do Node/V8, plataforma e os hashes calculados
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=golden diferente::node ${process.version} v8 ${process.versions.v8} ${process.platform}/${process.arch}; diferentes: ${diffs.join(',')}; hashes: ${out.join(',')}`);
  }
}
