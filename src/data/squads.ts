import type { Culture } from './countries';
import { generateSquad } from './squad';
import type { NationEra, Player } from '../engine/types';

const cache = new Map<string, Player[]>();

/**
 * Elenco (~40 jogadores) de uma seleção-era. O world.json guarda só os dados da seleção: o elenco é gerado sob demanda
 * a partir de uma seed fixa por seleção-era, então é sempre o mesmo. Times do draft carregam o próprio elenco.
 */
export function squadOf(n: NationEra): Player[] {
  if (n.customSquad) return renamed(n.id, n.customSquad);
  let squad = cache.get(n.id);
  if (!squad) {
    squad = generateSquad({ nationId: n.id, culture: n.culture as Culture, decade: n.decade, elo: n.elo, playStyle: n.playStyle });
    cache.set(n.id, squad);
  }
  return renamed(n.id, squad);
}

// ---------- nomes escolhidos pelo usuário ----------
// Só troca o texto do nome na hora de entregar o elenco: ids, atributos e sorteios do motor não mudam,
// então a partida é idêntica com qualquer nome. Fica no navegador (e no arquivo de save), nunca em world.json.

let overrides: Readonly<Record<string, string>> = {};
const renamedCache = new Map<string, { base: Player[]; out: Player[] }>();

/** Define os nomes personalizados (id do jogador -> nome). Cada contexto (tela e worker) mantém o seu. */
export function setNameOverrides(next: Readonly<Record<string, string>>): void {
  overrides = { ...next };
  renamedCache.clear();
}

export function nameOverrides(): Readonly<Record<string, string>> {
  return overrides;
}

function renamed(key: string, base: Player[]): Player[] {
  if (Object.keys(overrides).length === 0) return base;
  const hit = renamedCache.get(key);
  if (hit && hit.base === base) return hit.out;
  const out = base.some((p) => Object.hasOwn(overrides, p.id)) ? base.map((p) => (Object.hasOwn(overrides, p.id) ? { ...p, name: overrides[p.id] as string } : p)) : base;
  renamedCache.set(key, { base, out });
  return out;
}
