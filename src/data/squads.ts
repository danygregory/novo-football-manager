import type { NationEra, Player } from '../engine/types';

/** Elenco de uma seleção-era. (Na etapa do banco ampliado passa a ser gerado sob demanda.) */
export function squadOf(n: NationEra): Player[] {
  return n.squad;
}
