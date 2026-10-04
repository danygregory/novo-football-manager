import type { Culture } from './countries';
import { generateSquad } from './squad';
import type { NationEra, Player } from '../engine/types';

const cache = new Map<string, Player[]>();

/**
 * Elenco (~40 jogadores) de uma seleção-era. O world.json guarda só os dados da seleção: o elenco é gerado sob demanda
 * a partir de uma seed fixa por seleção-era, então é sempre o mesmo. Times do draft carregam o próprio elenco.
 */
export function squadOf(n: NationEra): Player[] {
  if (n.customSquad) return n.customSquad;
  let squad = cache.get(n.id);
  if (!squad) {
    squad = generateSquad({ nationId: n.id, culture: n.culture as Culture, decade: n.decade, elo: n.elo, playStyle: n.playStyle });
    cache.set(n.id, squad);
  }
  return squad;
}
