import worldJson from '../../data/world.json';
import { playerIndex } from '../engine/tournament';
import type { NationEra, Player, World } from '../engine/types';

export const world = worldJson as unknown as World;
export const nationsById = new Map(world.nations.map((n) => [n.id, n]));
export const playersById = playerIndex(world);

export const nationLabel = (n: NationEra) => `${n.country} · anos ${String(n.decade).slice(2)}`;
export const nationLabelById = (id: string) => {
  const n = nationsById.get(id);
  return n ? nationLabel(n) : id;
};
export const playerName = (id: string) => playersById.get(id)?.name ?? id;
export const playerById = (id: string): (Player & { nationId: string }) | undefined => playersById.get(id);
