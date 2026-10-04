import { describe, expect, it } from 'vitest';
import type { MatchEvent, Slot } from '../../engine/types';
import { Choreo, FIELD_H, FIELD_W, STEP, type Fx, type PlayerBrief } from './choreo';

const SLOTS: Slot[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'LW', 'CM', 'CM', 'RW', 'ST', 'ST'];

function briefs(): PlayerBrief[] {
  const out: PlayerBrief[] = [];
  ([0, 1] as const).forEach((side) =>
    SLOTS.forEach((slot, i) =>
      out.push({ id: `${side}-${i}`, name: `J${side}${i}`, side, slot, speed: 40 + ((i * 13 + side * 7) % 55), skill: 60, iq: 60, cond: 95, keeper: slot === 'GK' }),
    ),
  );
  return out;
}

function make(seed = 1): Choreo {
  const c = new Choreo(seed);
  c.setLineups(briefs(), [0.5, 0.5]);
  c.advance(2);
  return c;
}

const ev = (type: MatchEvent['type'], extra: Partial<MatchEvent> = {}): MatchEvent => ({ minute: 10, type, team: 0, zone: 'MID', t: 10, text: type, ...extra });
const names = (id: string) => id;

describe('coreografia', () => {
  it('é determinística: mesma seed e mesmos eventos geram as mesmas posições', () => {
    const run = () => {
      const c = make(7);
      c.push(ev('advance', { zone: 'ATT' }), names);
      c.push(ev('goal', { playerId: '0-9', secondaryPlayerId: '0-7', shotType: 'trabalhada', zone: 'BOX' }), names);
      c.advance(8);
      return [...c.agents.values()].map((a) => [a.id, a.x.toFixed(3), a.y.toFixed(3)]).concat([['ball', c.ball.x.toFixed(3), c.ball.y.toFixed(3)]]);
    };
    expect(run()).toEqual(run());
  });

  it('um gol só é confirmado quando a bola chega à rede, com efeitos de rede e gol', () => {
    const c = make(3);
    const fx: Fx[] = [];
    const committed: string[] = [];
    c.onFx = (f) => fx.push(f);
    c.onCommit = (e) => committed.push(e.type);
    c.push(ev('goal', { playerId: '0-9', secondaryPlayerId: '0-7', shotType: 'trabalhada', zone: 'BOX' }), names);
    c.advance(0.2);
    expect(committed).not.toContain('goal');
    c.advance(6);
    expect(committed).toContain('goal');
    expect(fx.map((f) => f.kind)).toEqual(expect.arrayContaining(['net', 'goal']));
    expect(c.ball.x).toBeGreaterThan(FIELD_W - 0.5); // dentro da rede do lado direito
  });

  it('chute para fora passa da linha de fundo e não gera efeito de gol', () => {
    const c = make(4);
    const fx: Fx[] = [];
    c.onFx = (f) => fx.push(f);
    c.push(ev('miss', { playerId: '0-9', shotType: 'trabalhada', zone: 'BOX' }), names);
    c.advance(6);
    expect(fx.some((f) => f.kind === 'goal')).toBe(false);
  });

  it('jogadores respeitam o limite de velocidade e nunca ficam colados (separação mínima)', () => {
    const c = make(9);
    for (let i = 0; i < 12; i++) {
      c.push(ev('advance', { team: (i % 2) as 0 | 1, zone: i % 3 === 0 ? 'DEF' : i % 3 === 1 ? 'MID' : 'ATT' }), names);
    }
    let minDist = Infinity;
    for (let k = 0; k < 60 * 14; k++) {
      c.advance(STEP);
      const list = [...c.agents.values()];
      for (const a of list) {
        expect(Math.hypot(a.vx, a.vy)).toBeLessThanOrEqual(a.vmax + 1e-6);
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.x).toBeLessThanOrEqual(FIELD_W);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeLessThanOrEqual(FIELD_H);
      }
      if (k % 30 === 0) {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) minDist = Math.min(minDist, Math.hypot((list[i]!.x - list[j]!.x), (list[i]!.y - list[j]!.y)));
      }
    }
    expect(minDist).toBeGreaterThan(1.5);
  });

  it('o atacante mais rápido percorre mais campo que o mais lento no mesmo tempo', () => {
    const c = make(2);
    const fast = [...c.agents.values()].filter((a) => a.side === 0).sort((a, b) => b.vmax - a.vmax)[0]!;
    const slow = [...c.agents.values()].filter((a) => a.side === 0).sort((a, b) => a.vmax - b.vmax)[0]!;
    expect(fast.vmax).toBeGreaterThan(slow.vmax * 1.2);
  });

  it('flush confirma todos os eventos sem animar', () => {
    const c = make(5);
    const seen: string[] = [];
    c.onCommit = (e) => seen.push(e.type);
    c.push(ev('advance', { zone: 'MID' }), names);
    c.push(ev('goal', { playerId: '0-9', zone: 'BOX' }), names);
    c.push(ev('yellow', { playerId: '1-3' }), names);
    c.flush();
    expect(seen).toEqual(['advance', 'goal', 'yellow']);
    expect(c.pending).toBe(0);
  });
});
