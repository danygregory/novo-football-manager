import { describe, expect, it } from 'vitest';
import { cos, exp, log, pow } from './dmath';

const rel = (a: number, b: number) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(b), 1e-300));

describe('dmath: determinístico e preciso', () => {
  it('exp, log, pow e cos batem com Math.* em ~1e-14 nas faixas do motor', () => {
    let worst = 0;
    for (let x = -30; x <= 30; x += 0.0371) worst = Math.max(worst, rel(exp(x), Math.exp(x)));
    for (let x = 1e-9; x < 1e7; x *= 1.07) worst = Math.max(worst, rel(log(x), Math.log(x)) * Math.abs(Math.log(x)) / Math.max(1, Math.abs(Math.log(x))));
    for (let a = 0.01; a < 500; a *= 1.13) for (const b of [0.7, 1 / 1.597, 1.597, 2.5, 0.55, 3, -1.2]) worst = Math.max(worst, rel(pow(a, b), Math.pow(a, b)));
    for (let x = 0; x <= 6.4; x += 0.0123) worst = Math.max(worst, Math.abs(cos(x) - Math.cos(x)));
    expect(worst).toBeLessThan(1e-13);
  });

  it('casos especiais', () => {
    expect(exp(0)).toBe(1);
    expect(log(1)).toBe(0);
    expect(pow(7, 0)).toBe(1);
    expect(pow(0, 2)).toBe(0);
    expect(pow(4, 0.5)).toBe(2);
    expect(log(0)).toBe(-Infinity);
    expect(Number.isNaN(log(-1))).toBe(true);
    expect(exp(800)).toBe(Infinity);
    expect(exp(-800)).toBe(0);
    expect(log(5e-324)).toBeCloseTo(Math.log(5e-324), 8);
    expect(() => pow(-2, 2)).toThrow();
  });

  it('valores fixos: o resultado exato (bit a bit) não pode mudar entre máquinas', () => {
    // fixados aqui: se algum dia mudar em outra arquitetura, este teste pega
    const bits = (x: number) => new BigUint64Array(new Float64Array([x]).buffer)[0]!.toString(16);
    const sample = [exp(1.5), exp(-7.25), log(3.7), log(1234.5678), pow(1.8, 1.597), pow(0.43, 1 / 1.597), cos(2.2), cos(5.9)].map(bits);
    expect(sample).toMatchInlineSnapshot(`
      [
        "4011ed3fe64fc541",
        "3f47455fe323fafe",
        "3ff4eeee650ae550",
        "401c7951d51791d7",
        "400474018f1278f0",
        "3fe2dd3976b2e1d9",
        "bfe2d5004b88ad70",
        "3fedade73ef95029",
      ]
    `);
  });
});
