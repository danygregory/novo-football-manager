import { cos as dcos, exp as dexp, log as dlog } from './dmath';
/** PRNG determinístico (mulberry32). Único gerador permitido no motor e nos geradores de dados. */

/** Hash de string -> uint32 (FNV-1a), para derivar seeds a partir de textos. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0;
  }

  /** Float em [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float em [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Inteiro em [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** true com probabilidade p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick: lista vazia');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Escolha ponderada; pesos <= 0 nunca são escolhidos. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) throw new Error('weighted: soma de pesos <= 0');
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(0, weights[i] ?? 0);
      if (r < 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  /** Normal(média, desvio) por Box-Muller. */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * dlog(u)) * dcos(2 * Math.PI * v);
  }

  /** Poisson por Knuth (adequado para lambdas pequenos). */
  poisson(lambda: number): number {
    const limit = dexp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > limit);
    return k - 1;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }

  /** Cria um gerador independente derivado deste (não consome o estado de forma previsível para o pai além de 1 sorteio). */
  fork(label: string): Rng {
    return new Rng((Math.floor(this.next() * 4294967296) ^ hashSeed(label)) >>> 0);
  }

  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}
