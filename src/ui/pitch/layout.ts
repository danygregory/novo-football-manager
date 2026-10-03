import type { Slot, Zone } from '../../engine/types';

/** Posição (0..1) de cada slot no campo, com o time atacando da esquerda para a direita. */
const SLOT_X: Record<Slot, number> = { GK: 0.05, CB: 0.2, LB: 0.22, RB: 0.22, WB: 0.32, DM: 0.36, CM: 0.46, AM: 0.58, LW: 0.68, RW: 0.68, ST: 0.76 };

function lanes(slot: Slot, n: number): number[] {
  if (slot === 'LB' || slot === 'LW') return Array.from({ length: n }, (_, i) => 0.12 + i * 0.1);
  if (slot === 'RB' || slot === 'RW') return Array.from({ length: n }, (_, i) => 0.88 - i * 0.1);
  if (slot === 'WB') return n === 1 ? [0.1] : n === 2 ? [0.1, 0.9] : Array.from({ length: n }, (_, i) => 0.1 + (0.8 * i) / (n - 1));
  if (slot === 'GK' || n === 1) return Array.from({ length: n }, () => 0.5);
  return Array.from({ length: n }, (_, i) => 0.3 + (0.4 * i) / (n - 1));
}

/** Coordenadas (0..1) dos jogadores em campo; `side` 1 é espelhado. `ballX` desloca o time na direção da bola. */
export function layoutSide(players: { id: string; slot: Slot }[], side: 0 | 1, ballX: number): Map<string, { x: number; y: number }> {
  const bySlot = new Map<Slot, string[]>();
  for (const p of players) bySlot.set(p.slot, [...(bySlot.get(p.slot) ?? []), p.id]);
  const out = new Map<string, { x: number; y: number }>();
  for (const [slot, ids] of bySlot) {
    const ys = lanes(slot, ids.length);
    ids.forEach((id, i) => {
      let x = SLOT_X[slot];
      if (slot !== 'GK') {
        // a bola em x (visto pelo lado 0); o lado 1 vê o campo espelhado
        const bx = side === 0 ? ballX : 1 - ballX;
        x += (bx - 0.5) * 0.34;
      }
      x = 0.04 + Math.max(0, Math.min(1, x)) * 0.92;
      const y = ys[i] as number;
      // o time 2 sai deslocado em y para não ficar exatamente sobre o adversário na mesma raia
      out.set(id, side === 0 ? { x, y } : { x: 1 - x, y: Math.min(0.97, Math.max(0.03, 1 - y + 0.045)) });
    });
  }
  return out;
}

/** Posição da bola (0..1) pelo time com a posse e a zona (do ponto de vista de quem ataca). */
export function ballPosition(team: 0 | 1, zone: Zone, jitter: number): { x: number; y: number } {
  const x = zone === 'DEF' ? 0.16 : zone === 'MID' ? 0.5 : zone === 'ATT' ? 0.76 : 0.92;
  const y = 0.5 + (jitter - 0.5) * 0.7;
  return team === 0 ? { x, y } : { x: 1 - x, y: 1 - y };
}
