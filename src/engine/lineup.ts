import { FORMATION_SLOTS, slotPosition } from './formations';
import { overall } from './player';
import type { Formation, Lineup, Player, Position, Slot, Tactics } from './types';

export const DEFAULT_TACTICS: Tactics = { formation: '4-4-2', pressing: 0.5, lineHeight: 0.5, tempo: 0.5 };

const ADJACENT: Record<Position, Position[]> = { GK: [], DEF: ['MID'], MID: ['DEF', 'FWD'], FWD: ['MID'] };

/** Multiplicador de rendimento de um jogador fora da sua posição natural. */
export function fit(p: Pick<Player, 'position' | 'slot'>, slot: Slot): number {
  if (slot === 'GK') return p.position === 'GK' ? 1 : 0.3;
  if (p.position === 'GK') return 0.3;
  if (p.slot === slot) return 1;
  const target = slotPosition(slot);
  if (p.position === target) return 0.9;
  return ADJACENT[p.position].includes(target) ? 0.78 : 0.6;
}

/** Fator de condição física usado na escolha automática (condição 100 = 1). */
const condFactor = (p: Player) => 0.7 + 0.3 * (p.condition / 100);

/**
 * Distribui jogadores nos slots da formação maximizando nota x encaixe (guloso, goleiro primeiro).
 * Devolve os ids na ordem dos slots.
 */
export function assignSlots(players: Player[], formation: Formation, score: (p: Player) => number = overall): string[] {
  const slots = FORMATION_SLOTS[formation];
  const remaining = new Set(players);
  const result: string[] = new Array(slots.length).fill('');
  // ordem: goleiro, depois slots mais raros primeiro (ST, wingers, AM, ...) para não sobrar improviso no ataque.
  const priority: Slot[] = ['GK', 'ST', 'LW', 'RW', 'AM', 'DM', 'CM', 'WB', 'LB', 'RB', 'CB'];
  const order = slots.map((s, i) => ({ s, i })).sort((a, b) => priority.indexOf(a.s) - priority.indexOf(b.s));
  for (const { s, i } of order) {
    let best: Player | undefined;
    let bestScore = -Infinity;
    for (const p of remaining) {
      const v = score(p) * fit(p, s);
      if (v > bestScore) {
        bestScore = v;
        best = p;
      }
    }
    if (!best) throw new Error('assignSlots: jogadores insuficientes');
    result[i] = best.id;
    remaining.delete(best);
  }
  return result;
}

/** Escalação automática: 11 melhores (nota x condição x encaixe) e banco com o restante. */
export function autoLineup(nationId: string, squad: Player[], tactics: Tactics = DEFAULT_TACTICS): Lineup {
  const score = (p: Player) => overall(p) * condFactor(p);
  const starters = assignSlots(squad, tactics.formation, score);
  const used = new Set(starters);
  const rest = squad.filter((p) => !used.has(p.id)).sort((a, b) => score(b) - score(a));
  // garante um goleiro no banco, se houver.
  const gk = rest.find((p) => p.position === 'GK');
  const bench = rest.slice(0, 12);
  if (gk && !bench.includes(gk)) bench[bench.length - 1] = gk;
  return { nationId, tactics: { ...tactics }, starters, bench: bench.map((p) => p.id) };
}

const QUOTA_23: [Slot, number][] = [
  ['GK', 3], ['CB', 4], ['LB', 1], ['RB', 1], ['WB', 1], ['DM', 2], ['CM', 3], ['AM', 2], ['LW', 1], ['RW', 1], ['ST', 3],
];

/** 23 convocados automáticos de um pool: cota por slot e o resto pelos melhores. */
export function autoSquad23(pool: Player[]): Player[] {
  const chosen = new Set<Player>();
  for (const [slot, n] of QUOTA_23) {
    pool
      .filter((p) => p.slot === slot && !chosen.has(p))
      .sort((a, b) => overall(b) - overall(a))
      .slice(0, n)
      .forEach((p) => chosen.add(p));
  }
  pool
    .filter((p) => !chosen.has(p) && p.position !== 'GK')
    .sort((a, b) => overall(b) - overall(a))
    .slice(0, 23 - chosen.size)
    .forEach((p) => chosen.add(p));
  return pool.filter((p) => chosen.has(p));
}

export function validateLineup(lineup: Lineup, squad: Player[]): string[] {
  const errors: string[] = [];
  const ids = new Set(squad.map((p) => p.id));
  if (lineup.starters.length !== 11) errors.push('São necessários 11 titulares.');
  const all = [...lineup.starters, ...lineup.bench];
  if (new Set(all).size !== all.length) errors.push('Jogador repetido na escalação.');
  for (const id of all) if (!ids.has(id)) errors.push(`Jogador ${id} fora do elenco.`);
  const gk = squad.find((p) => p.id === lineup.starters[0]);
  if (gk && gk.position !== 'GK') errors.push('O primeiro titular deve ser o goleiro.');
  return errors;
}
