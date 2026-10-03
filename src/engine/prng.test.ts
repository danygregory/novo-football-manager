import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from './prng';

describe('Rng', () => {
  it('mesma seed gera a mesma sequência', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('seeds diferentes divergem', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('seed em texto é estável', () => {
    expect(hashSeed('BRA-1970')).toBe(hashSeed('BRA-1970'));
    expect(new Rng('x').next()).toBe(new Rng('x').next());
  });

  it('next fica em [0,1) e é razoavelmente uniforme', () => {
    const r = new Rng(7);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
  });

  it('int respeita limites inclusivos', () => {
    const r = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('poisson tem média próxima de lambda', () => {
    const r = new Rng(9);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += r.poisson(1.3);
    expect(sum / n).toBeGreaterThan(1.25);
    expect(sum / n).toBeLessThan(1.35);
  });

  it('getState/setState permite retomar a sequência', () => {
    const r = new Rng(5);
    r.next();
    const s = r.getState();
    const x = r.next();
    r.setState(s);
    expect(r.next()).toBe(x);
  });

  it('shuffle é determinístico e preserva elementos', () => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = new Rng(11).shuffle(base);
    expect(a).toEqual(new Rng(11).shuffle(base));
    expect([...a].sort()).toEqual(base);
  });
});
