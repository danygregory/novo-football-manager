import { scenarioById } from '../engine/scenarios';
import { STAGE_LABEL, type Stage } from '../engine/tournament';
import type { NationEra } from '../engine/types';

/** Distância entre duas cores "#rrggbb" (0 a ~441). */
export function colorDistance(a: string, b: string): number {
  const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(a) as [number, number, number];
  const [r2, g2, b2] = rgb(b) as [number, number, number];
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** Abaixo disso duas camisas se confundem no campo. */
const MIN_KIT_DISTANCE = 90;
/** Reservas do adversário, em ordem, quando as cores dele se parecem com as do outro time. */
const FALLBACK_KITS = ['#3b82d6', '#d94b3d', '#f2c744', '#ffffff', '#101418'];

/**
 * Cores de camisa dos dois times, usadas no campo, no placar e na legenda para que todo lugar mostre o mesmo. O primeiro time fica com a
 * cor principal; o segundo, com a principal, a secundária ou uma reserva, a primeira que se distinga do primeiro (Brasil 70 contra o
 * Brasil de hoje não pode ser amarelo contra amarelo).
 */
export function kitColors(a: Pick<NationEra, 'colors'>, b: Pick<NationEra, 'colors'>): readonly [string, string] {
  const c0 = a.colors.primary;
  const options = [b.colors.primary, b.colors.secondary, ...FALLBACK_KITS];
  const c1 = options.find((c) => colorDistance(c0, c) >= MIN_KIT_DISTANCE) ?? options.reduce((best, c) => (colorDistance(c0, c) > colorDistance(c0, best) ? c : best));
  return [c0, c1] as const;
}

/** Título da partida: o nome do cenário (por exemplo "O milagre de Berna") ou o da fase da Copa. Cenário desconhecido cai no nome da fase. */
export function stageTitle(t: { scenario?: { id: string; opponent: string } }, stage: Stage): string {
  return (t.scenario && scenarioById(t.scenario.id)?.title) || STAGE_LABEL[stage];
}
