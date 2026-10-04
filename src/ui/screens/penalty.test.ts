import { describe, expect, it } from 'vitest';
import { ZONE_POINT, penaltyFrame, timeline } from './PenaltyScreen';

describe('cena de pênalti', () => {
  const tl = timeline(false);
  const tKick = tl.tension + tl.runup;
  const afterFlight = tKick + tl.flight + 5;

  it('antes do chute a bola está na marca; depois do voo está no alvo da zona (gol)', () => {
    const f0 = penaltyFrame(100, { zone: 'RH', dive: 'L', outcome: 'goal' }, false);
    expect(f0.ball.y).toBeGreaterThan(360);
    const f = penaltyFrame(afterFlight, { zone: 'RH', dive: 'L', outcome: 'goal' }, false);
    expect(Math.abs(f.ball.x - ZONE_POINT.RH.x)).toBeLessThan(30);
    expect(f.label).toBe('GOL!');
  });

  it('o goleiro mergulha para o lado escolhido e a defesa só acontece se for o lado da bola', () => {
    const sav = penaltyFrame(afterFlight + 200, { zone: 'LL', dive: 'L', outcome: 'save' }, false);
    expect(sav.keeper.x).toBeLessThan(330);
    expect(sav.label).toBe('DEFENDEU!');
    const wrong = penaltyFrame(afterFlight + 200, { zone: 'LL', dive: 'R', outcome: 'goal' }, false);
    expect(wrong.keeper.x).toBeGreaterThan(470);
  });

  it('fora, trave e gol têm rótulos próprios; a versão curta termina antes da completa', () => {
    expect(penaltyFrame(afterFlight, { zone: 'LH', dive: 'R', outcome: 'miss' }, false).label).toBe('PRA FORA!');
    expect(penaltyFrame(afterFlight, { zone: 'LH', dive: 'R', outcome: 'post' }, false).label).toBe('NA TRAVE!');
    const total = (short: boolean) => timeline(short).tension + timeline(short).runup + timeline(short).flight + timeline(short).aftermath;
    expect(total(true)).toBeLessThan(total(false) / 1.5);
    expect(penaltyFrame(total(true) + 1, { zone: 'CL', dive: 'C', outcome: 'goal' }, true).done).toBe(true);
  });
});
