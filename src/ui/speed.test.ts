import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEED, SPEEDS, isSpeed, nominalMinutes, tauRate } from './speed';

describe('velocidades', () => {
  it('só existem 2x e 4x (a 1x foi removida) e o padrão é 2x', () => {
    expect(SPEEDS).toEqual([2, 4]);
    expect(DEFAULT_SPEED).toBe(2);
    expect(isSpeed(1)).toBe(false);
    expect(isSpeed(2)).toBe(true);
  });

  it('4x é o dobro de 2x e as durações ficam nas faixas pedidas (com a desaceleração média de 0,63 medida nas jogadas de perigo)', () => {
    expect(tauRate(4)).toBeCloseTo(2 * tauRate(2), 6);
    const slowdown = 1 / 0.63;
    const m2 = nominalMinutes(2) * slowdown;
    const m4 = nominalMinutes(4) * slowdown;
    expect(m2).toBeGreaterThan(5);
    expect(m2).toBeLessThan(6.2);
    expect(m4).toBeGreaterThan(2);
    expect(m4).toBeLessThan(3.1);
  });
});
