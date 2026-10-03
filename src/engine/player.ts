import type { Attributes, Player, Position } from './types';

/** Pesos de cada atributo na nota geral por posição. Somam 1. */
const OVERALL_WEIGHTS: Record<Position, Attributes> = {
  GK: { defesa: 0.05, passe: 0.1, drible: 0, finalizacao: 0, fisico: 0.1, velocidade: 0, goleiro: 0.75 },
  DEF: { defesa: 0.45, passe: 0.15, drible: 0.05, finalizacao: 0, fisico: 0.2, velocidade: 0.15, goleiro: 0 },
  MID: { defesa: 0.2, passe: 0.3, drible: 0.2, finalizacao: 0.1, fisico: 0.1, velocidade: 0.1, goleiro: 0 },
  FWD: { defesa: 0, passe: 0.1, drible: 0.25, finalizacao: 0.35, fisico: 0.1, velocidade: 0.2, goleiro: 0 },
};

export function overall(p: Pick<Player, 'position' | 'attrs'>): number {
  const w = OVERALL_WEIGHTS[p.position];
  let sum = 0;
  for (const key of Object.keys(w) as (keyof Attributes)[]) sum += w[key] * p.attrs[key];
  return sum;
}
