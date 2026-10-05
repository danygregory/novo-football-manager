/**
 * Links de desafio: tudo vai no hash (`#c=...`), então nada é enviado a servidor algum.
 * Como o motor é determinístico, seleção + recorte + seed reproduzem a mesma Copa (sorteio, grupos e adversários).
 */
import type { Cut } from '../engine/tournament';
import { DATE_RE, ID_RE } from '../save/guards';

export type Challenge =
  | { kind: 'cup'; nationId: string; cut: Cut; seed: number; /** pontos de quem desafiou */ points?: number; stage?: string }
  | { kind: 'scenario'; id: string; points?: number }
  | { kind: 'daily'; date: string };

const CUTS = [1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

export function encodeChallenge(c: Challenge): string {
  const p = new URLSearchParams();
  p.set('k', c.kind);
  if (c.kind === 'cup') {
    p.set('n', c.nationId);
    p.set('u', String(c.cut));
    p.set('s', String(c.seed));
    if (c.points !== undefined) p.set('p', String(c.points));
    if (c.stage) p.set('e', c.stage.slice(0, 40));
  } else if (c.kind === 'scenario') {
    p.set('i', c.id);
    if (c.points !== undefined) p.set('p', String(c.points));
  } else p.set('d', c.date);
  return `#c=${encodeURIComponent(p.toString())}`;
}

export interface Known {
  nation: (id: string) => boolean;
  scenario: (id: string) => boolean;
}

const intIn = (v: string | null, lo: number, hi: number): number | undefined => {
  if (v === null || !/^\d{1,10}$/.test(v)) return undefined;
  const n = Number(v);
  return n >= lo && n <= hi ? n : undefined;
};

/** Lê o hash da página; devolve `undefined` para qualquer coisa inválida (o hash é entrada não confiável). */
export function parseChallenge(hash: string, known: Known): Challenge | undefined {
  if (!hash.startsWith('#c=') || hash.length > 300) return undefined;
  let p: URLSearchParams;
  try {
    p = new URLSearchParams(decodeURIComponent(hash.slice(3)));
  } catch {
    return undefined;
  }
  const points = intIn(p.get('p'), 0, 100000);
  const kind = p.get('k');
  if (kind === 'cup') {
    const nationId = p.get('n') ?? '';
    const cutRaw = p.get('u') ?? '';
    const cut: Cut | undefined = cutRaw === 'all' ? 'all' : CUTS.includes(Number(cutRaw)) ? (Number(cutRaw) as Cut) : undefined;
    const seed = intIn(p.get('s'), 0, 0xffffffff);
    if (!ID_RE.test(nationId) || !known.nation(nationId) || cut === undefined || seed === undefined) return undefined;
    const stage = p.get('e')?.replace(/[^\p{L}\p{N} \-–]/gu, '').slice(0, 40) || undefined;
    return { kind, nationId, cut, seed, points, stage };
  }
  if (kind === 'scenario') {
    const id = p.get('i') ?? '';
    return ID_RE.test(id) && known.scenario(id) ? { kind, id, points } : undefined;
  }
  if (kind === 'daily') {
    const date = p.get('d') ?? '';
    return DATE_RE.test(date) ? { kind, date } : undefined;
  }
  return undefined;
}

/** Endereço completo do jogo (sem hash) para montar links. */
export function baseUrl(loc: Pick<Location, 'origin' | 'pathname'> = location): string {
  return `${loc.origin}${loc.pathname}`;
}
