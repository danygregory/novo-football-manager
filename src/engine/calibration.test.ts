import { describe, expect, it } from 'vitest';
import world from '../../data/world.json';
import { runCalibration } from './calibration';
import type { World } from './types';

const w = world as unknown as World;

describe('calibração (5.000 jogos em campo neutro)', () => {
  const r = runCalibration(w, 5000, {}, 2026, 800);

  it('gols por jogo entre 2,5 e 2,8', () => {
    expect(r.goalsPerGame).toBeGreaterThanOrEqual(2.5);
    expect(r.goalsPerGame).toBeLessThanOrEqual(2.8);
  });

  it('empates entre 23% e 28%', () => {
    expect(r.drawRate).toBeGreaterThanOrEqual(0.23);
    expect(r.drawRate).toBeLessThanOrEqual(0.28);
  });

  it('xG total acompanha os gols (conversão coerente)', () => {
    expect(Math.abs(r.xgPerGame - r.goalsPerGame)).toBeLessThan(0.3);
  });

  it('o mais forte vence mais que perde em toda faixa, a vantagem cresce com a diferença e há zebras em todas', () => {
    let prev = 0;
    for (const b of r.bands) {
      expect(b.games).toBeGreaterThan(100);
      expect(b.strongWins).toBeGreaterThan(b.upsets);
      expect(b.upsets).toBeGreaterThan(0.04);
      expect(b.score).toBeGreaterThan(prev - 0.01);
      prev = b.score;
    }
    expect((r.bands[4] as { score: number }).score).toBeGreaterThan((r.bands[0] as { score: number }).score + 0.15);
  });

  it('entre seleções da mesma década, os gols ficam a até 0,3 da média real', () => {
    for (const d of r.decades) expect(Math.abs(d.diff), `década ${d.decade}`).toBeLessThanOrEqual(0.3);
  });
});
