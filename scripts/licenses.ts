import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Gera THIRD_PARTY_NOTICES.md com as licenças de tudo o que vai no build (dependências de produção, em todos os níveis).
 * Uso: npm run licenses
 */
interface Node {
  version?: string;
  resolved?: string;
  dependencies?: Record<string, Node>;
}
const root = resolve(import.meta.dirname, '..');
const tree = JSON.parse(execSync('npm ls --omit=dev --all --json', { cwd: root, maxBuffer: 1 << 26 }).toString()) as Node;
const found = new Map<string, { name: string; version: string; license: string; homepage: string }>();
const walk = (deps: Record<string, Node> | undefined) => {
  for (const [name, n] of Object.entries(deps ?? {})) {
    const key = `${name}@${n.version}`;
    if (!found.has(key)) {
      let license = 'DESCONHECIDA';
      let homepage = '';
      try {
        const pkg = JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')) as { license?: string | { type: string }; homepage?: string; repository?: string | { url: string } };
        license = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? 'DESCONHECIDA');
        homepage = pkg.homepage ?? (typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? ''));
      } catch {
        /* pacote aninhado: fica como desconhecida e aparece no relatório */
      }
      found.set(key, { name, version: n.version ?? '?', license, homepage });
    }
    walk(n.dependencies);
  }
};
walk(tree.dependencies);
const rows = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
const md = `# Avisos de terceiros

Gerado por \`npm run licenses\`. Lista o que vai no build de produção.

## Software

| Pacote | Versão | Licença |
| --- | --- | --- |
${rows.map((r) => `| ${r.name} | ${r.version} | ${r.license} |`).join('\n')}

## Dados

- **International results** (martj42), [github.com/martj42/international_results](https://github.com/martj42/international_results): **CC0 1.0 Universal** (domínio público). Os CSVs e a licença estão em \`data/raw/\`; os hashes, em \`docs/DADOS.md\`. O produto usa só os dados derivados (\`data/world.json\`, \`data/summaries.json\`), com elencos e nomes inteiramente fictícios.
- A Fjelstul World Cup Database (CC-BY-SA 4.0, com nomes reais) **não** é usada.

## Marcas e imagens

Sem escudos de federações, sem nomes reais de jogadores e sem imagens de terceiros: só nomes de países e cores.
`;
writeFileSync(resolve(root, 'THIRD_PARTY_NOTICES.md'), md);
const unknown = rows.filter((r) => r.license === 'DESCONHECIDA');
console.log(`${rows.length} pacotes de produção; licenças: ${[...new Set(rows.map((r) => r.license))].join(', ')}`);
if (unknown.length) console.log('Sem licença legível:', unknown.map((r) => r.name).join(', '));
