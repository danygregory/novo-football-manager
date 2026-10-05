/**
 * Validação de tudo o que vem de fora (localStorage adulterado ou corrompido, arquivo importado).
 * Cada guard devolve o valor limpo (só os campos conhecidos, com tipos e limites conferidos) ou `undefined`.
 * Registros indexados por id são conferidos chave a chave: nada de `__proto__`, `constructor` e afins.
 */
import type { Career, CareerEntry, DailyRecord, Lineup, RankingEntry, Tactics } from '../engine';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
const int = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = num(v, lo, hi);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
};
const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

export const ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const id = (v: unknown): string | undefined => (typeof v === 'string' && ID_RE.test(v) && !FORBIDDEN_KEYS.has(v) ? v : undefined);
export const color = (v: unknown): string | undefined => (typeof v === 'string' && COLOR_RE.test(v) ? v : undefined);
const date = (v: unknown): string | undefined => (typeof v === 'string' && DATE_RE.test(v) ? v : undefined);
const idList = (v: unknown, max: number): string[] | undefined => {
  if (!Array.isArray(v) || v.length > max) return undefined;
  const out = v.map(id);
  return out.every((x): x is string => x !== undefined) ? out : undefined;
};

/** Todos os campos obrigatórios presentes ou nada. */
function all<T extends object>(o: { [K in keyof T]: T[K] | undefined }): T | undefined {
  return Object.values(o).some((x) => x === undefined) ? undefined : (o as T);
}

const FORMATIONS = ['4-4-2', '4-3-3', '3-5-2', '5-4-1'] as const;
const CUTS = new Set(['all', '1930', '1940', '1950', '1960', '1970', '1980', '1990', '2000', '2010', '2020']);
const MODES = ['career', 'daily', 'draft', 'ready'] as const;

export function tactics(v: unknown): Tactics | undefined {
  if (!isObj(v) || !FORMATIONS.includes(v.formation as never)) return undefined;
  return all<Tactics>({ formation: v.formation as Tactics['formation'], pressing: num(v.pressing, 0, 1), lineHeight: num(v.lineHeight, 0, 1), tempo: num(v.tempo, 0, 1) });
}

export function lineup(v: unknown): Lineup | undefined {
  if (!isObj(v)) return undefined;
  const starters = idList(v.starters, 11);
  const bench = idList(v.bench, 12);
  if (starters?.length !== 11) return undefined;
  return all<Lineup>({ nationId: id(v.nationId), tactics: tactics(v.tactics), starters, bench });
}

function careerEntry(v: unknown): CareerEntry | undefined {
  if (!isObj(v) || !CUTS.has(String(v.cut))) return undefined;
  const pot = int(v.pot, 1, 4) as CareerEntry['pot'] | undefined;
  const stage = int(v.stage, 0, 5) as CareerEntry['stage'] | undefined;
  return all<CareerEntry>({
    n: int(v.n, 1, 1000), nationId: id(v.nationId), teamLabel: text(v.teamLabel, 120), cut: v.cut as CareerEntry['cut'], stage,
    w: int(v.w, 0, 20), d: int(v.d, 0, 20), l: int(v.l, 0, 20), gf: int(v.gf, 0, 200), ga: int(v.ga, 0, 200),
    champion: bool(v.champion), pot, repBefore: num(v.repBefore, -100, 200), repAfter: num(v.repAfter, -100, 200), points: num(v.points, -1e6, 1e6),
  });
}

export function career(v: unknown): Career | undefined {
  if (!isObj(v) || !Array.isArray(v.entries) || v.entries.length > 500) return undefined;
  const entries = v.entries.map(careerEntry);
  if (!entries.every((e): e is CareerEntry => e !== undefined)) return undefined;
  const out = all<Career>({ id: text(v.id, 64), seed: int(v.seed, 0, 0xffffffff), rep: num(v.rep, -100, 200), entries });
  if (!out) return undefined;
  // campos opcionais: se vierem, precisam ser válidos
  for (const [k, g] of [['nationId', id], ['called', (x: unknown) => idList(x, 23)], ['lineup', lineup], ['startOptions', (x: unknown) => idList(x, 8)], ['offers', (x: unknown) => idList(x, 8)]] as const) {
    if (v[k] === undefined) continue;
    const val = g(v[k]);
    if (val === undefined) return undefined;
    (out as unknown as Obj)[k] = val;
  }
  return out;
}

function capped<T>(v: unknown, max: number, g: (x: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(v) || v.length > max) return undefined;
  const out = v.map(g);
  return out.every((x): x is T => x !== undefined) ? out : undefined;
}

function rankingEntry(v: unknown): RankingEntry | undefined {
  if (!isObj(v) || !MODES.includes(v.mode as never)) return undefined;
  return all<RankingEntry>({
    date: date(v.date), mode: v.mode as RankingEntry['mode'], team: text(v.team, 120), points: num(v.points, -1e6, 1e6), stageText: text(v.stageText, 80),
    w: int(v.w, 0, 20), d: int(v.d, 0, 20), l: int(v.l, 0, 20), gf: int(v.gf, 0, 200), ga: int(v.ga, 0, 200), pot: int(v.pot, 1, 4), champion: bool(v.champion),
  });
}
export const ranking = (v: unknown): RankingEntry[] | undefined => capped(v, 100, rankingEntry);

/** Registro de objeto -> Map-like seguro: chaves validadas, valores limpos, tamanho limitado. */
function record<T>(v: unknown, max: number, key: (k: string) => string | undefined, val: (x: unknown) => T | undefined): Record<string, T> | undefined {
  if (!isObj(v)) return undefined;
  const keys = Object.keys(v);
  if (keys.length > max) return undefined;
  const out: Record<string, T> = Object.create(null);
  for (const k of keys) {
    const kk = key(k);
    const vv = val(v[k]);
    if (kk === undefined || vv === undefined) return undefined;
    out[kk] = vv;
  }
  return out;
}

export const achievements = (v: unknown): Record<string, string> | undefined => record(v, 200, id, date);

function dailyRecord(v: unknown): DailyRecord | undefined {
  if (!isObj(v)) return undefined;
  return all<DailyRecord>({ date: date(v.date), points: num(v.points, -1e6, 1e6), stageText: text(v.stageText, 80), champion: bool(v.champion), text: text(v.text, 600) });
}
export const daily = (v: unknown): Record<string, DailyRecord> | undefined => record(v, 2000, (k) => date(k), dailyRecord);

export const stats = (v: unknown): { cups: number } | undefined => (isObj(v) ? all<{ cups: number }>({ cups: int(v.cups, 0, 1e7) }) : undefined);

export interface Settings {
  reduceMotion?: boolean;
  speed?: 2 | 4;
}
export function settings(v: unknown): Settings | undefined {
  if (!isObj(v)) return undefined;
  const out: Settings = {};
  if (typeof v.reduceMotion === 'boolean') out.reduceMotion = v.reduceMotion;
  if (v.speed === 2 || v.speed === 4) out.speed = v.speed;
  return out;
}

export interface ScenarioBest {
  points: number;
  text: string;
  date: string;
}
export const scenarios = (v: unknown): Record<string, ScenarioBest> | undefined =>
  record(v, 100, id, (x) => (isObj(x) ? all<ScenarioBest>({ points: int(x.points, 0, 100000), text: text(x.text, 80), date: date(x.date) }) : undefined));
