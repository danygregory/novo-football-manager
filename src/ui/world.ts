import worldJson from '../../data/world.json';
import { squadOf } from '../data/squads';
import { findPlayer, withCustom } from '../engine/tournament';
import type { NationEra, Player, World } from '../engine/types';

export const world = worldJson as unknown as World;
/** Seleções por id. Quando há time do draft, ele é registrado aqui (ver `registerCustom`). */
export const nationsById = new Map(world.nations.map((n) => [n.id, n]));

const customPlayers = new Map<string, Player & { nationId: string }>();
let customNation: NationEra | undefined;

/** Registra (ou limpa) o time montado no draft para as buscas da interface. */
export function registerCustom(n: NationEra | undefined): void {
  if (customNation) {
    nationsById.delete(customNation.id);
    customPlayers.clear();
  }
  customNation = n;
  if (n) {
    nationsById.set(n.id, n);
    for (const p of squadOf(n)) customPlayers.set(p.id, { ...p, nationId: n.id });
  }
}

/** Período curto da seleção-era: "anos 70" ou "1950–56". */
export const eraSpan = (n: NationEra) => (n.custom ? 'time montado' : n.kind === 'peak' ? `${n.span[0]}–${String(n.span[1]).slice(2)}` : `anos ${String(n.decade).slice(2)}`);
export const nationLabel = (n: NationEra) => (n.custom ? n.country : `${n.country} · ${eraSpan(n)}`);
export const nationLabelById = (id: string) => {
  const n = nationsById.get(id);
  return n ? nationLabel(n) : id;
};
export const playerById = (id: string): (Player & { nationId: string }) | undefined => customPlayers.get(id) ?? findPlayer(withCustom(world, customNation), id);
