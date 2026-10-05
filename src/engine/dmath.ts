/**
 * Matemática determinística: pow, exp, log e cos feitas só com + - * / (exatos no IEEE 754) e manipulação de bits.
 *
 * Por quê: Math.pow/exp/log/cos do V8 podem diferir no último bit entre arquiteturas (x64 e arm64 usam código compilado
 * de forma diferente), e uma diferença de 1 bit muda o desfecho de algumas partidas. Para que "mesma seed = mesma partida"
 * valha em qualquer máquina (links de desafio, desafio do dia, replays), tudo que decide o jogo passa por aqui.
 * A precisão é de ~1e-15 (testada contra Math.*); o que importa é o resultado ser idêntico em todo lugar.
 */

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
/** Índice da palavra alta do double (depende da ordem dos bytes da máquina). */
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0;
const LO = 1 - HI;

const LN2_HI = 6.93147180369123816490e-01;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e+00;
const SQRT2 = 1.41421356237309504880;
const TWO_OVER_PI = 0.63661977236758134308;
const PIO2_1 = 1.57079632673412561417e+00;
const PIO2_2 = 6.07710050650619224932e-11;

/** 2^n exato para n inteiro em [-1022, 1023]. */
function pow2(n: number): number {
  u32[HI] = (n + 1023) << 20;
  u32[LO] = 0;
  return f64[0] as number;
}

const EXP_C: number[] = [];
{
  let fact = 1;
  for (let k = 0; k <= 15; k++) {
    if (k > 0) fact *= k;
    EXP_C.push(1 / fact);
  }
}

export function exp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.7) return Infinity;
  if (x < -745) return 0;
  const n = Math.round(x * INV_LN2);
  const r = x - n * LN2_HI - n * LN2_LO;
  let p = EXP_C[15] as number;
  for (let k = 14; k >= 0; k--) p = p * r + (EXP_C[k] as number);
  if (n > 1023) return p * pow2(n - 1000) * pow2(1000);
  if (n < -1022) return p * pow2(n + 1000) * pow2(-1000);
  return p * pow2(n);
}

export function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  f64[0] = x;
  let hi = u32[HI] as number;
  let e = (hi >>> 20) - 1023;
  if (hi >>> 20 === 0) {
    // subnormal: reescala por 2^54 (exato)
    f64[0] = x * 18014398509481984;
    hi = u32[HI] as number;
    e = (hi >>> 20) - 1023 - 54;
  }
  u32[HI] = (hi & 0x000fffff) | 0x3ff00000;
  let m = f64[0] as number;
  if (m > SQRT2) {
    m *= 0.5;
    e += 1;
  }
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  // 2 * atanh(s) = 2 * (s + s^3/3 + s^5/5 + ...); |s| <= 0.1716
  let p = 1 / 23;
  p = p * s2 + 1 / 21;
  p = p * s2 + 1 / 19;
  p = p * s2 + 1 / 17;
  p = p * s2 + 1 / 15;
  p = p * s2 + 1 / 13;
  p = p * s2 + 1 / 11;
  p = p * s2 + 1 / 9;
  p = p * s2 + 1 / 7;
  p = p * s2 + 1 / 5;
  p = p * s2 + 1 / 3;
  p = p * s2 + 1;
  return e * LN2_HI + (e * LN2_LO + 2 * s * p);
}

/** a^b para a >= 0 (as bases do motor são sempre positivas). */
export function pow(a: number, b: number): number {
  if (b === 0 || a === 1) return 1;
  if (a !== a || b !== b) return NaN;
  if (a === 0) return b > 0 ? 0 : Infinity;
  if (a < 0) throw new Error('dmath.pow: base negativa');
  if (b === 1) return a;
  if (b === 0.5) return Math.sqrt(a); // sqrt é exato (arredondamento correto no IEEE)
  return exp(b * log(a));
}

const SIN_C: number[] = [];
const COS_C: number[] = [];
{
  let fact = 1;
  for (let k = 0; k <= 20; k++) {
    if (k > 0) fact *= k;
    if (k % 2 === 1) SIN_C.push((((k - 1) / 2) % 2 === 0 ? 1 : -1) / fact);
    else COS_C.push(((k / 2) % 2 === 0 ? 1 : -1) / fact);
  }
}

/** sin/cos de |r| <= pi/4 (Taylor). */
function sinPoly(r: number): number {
  const r2 = r * r;
  let p = SIN_C[SIN_C.length - 1] as number;
  for (let i = SIN_C.length - 2; i >= 0; i--) p = p * r2 + (SIN_C[i] as number);
  return r * p;
}
function cosPoly(r: number): number {
  const r2 = r * r;
  let p = COS_C[COS_C.length - 1] as number;
  for (let i = COS_C.length - 2; i >= 0; i--) p = p * r2 + (COS_C[i] as number);
  return p;
}

/** cos(x) para |x| < ~1e6 (o motor só usa [0, 2pi]). */
export function cos(x: number): number {
  const q = Math.round(x * TWO_OVER_PI);
  const r = x - q * PIO2_1 - q * PIO2_2;
  switch (((q % 4) + 4) % 4) {
    case 0:
      return cosPoly(r);
    case 1:
      return -sinPoly(r);
    case 2:
      return -cosPoly(r);
    default:
      return sinPoly(r);
  }
}
