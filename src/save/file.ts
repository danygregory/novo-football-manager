import { ENGINE_VERSION } from '../engine/version';
import { runIds } from './run';
import { SCHEMA, type SaveData, type SaveKey, type SaveRepository } from './repository';

/** Formato do arquivo de exportação. Suba SAVE_VERSION ao mudar o esquema e escreva a migração em `migrate`. */
export const SAVE_FORMAT = 'novo-fm-save';
export const SAVE_VERSION = 1;
/** Limite do arquivo importado (o save real tem poucas dezenas de KB). */
export const MAX_SAVE_BYTES = 2_000_000;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  engineVersion: number;
  exportedAt: string;
  data: SaveData;
}

export function exportSave(repo: SaveRepository, now = new Date()): string {
  const file: SaveFile = { format: SAVE_FORMAT, version: SAVE_VERSION, engineVersion: ENGINE_VERSION, exportedAt: now.toISOString(), data: repo.snapshot() };
  return JSON.stringify(file, null, 1);
}

export type ImportResult = { ok: true; data: SaveData; engineVersion: number } | { ok: false; error: string };

/** Migra um save antigo para a versão atual (por enquanto só existe a versão 1). */
function migrate(version: number, data: unknown): unknown {
  return version === SAVE_VERSION ? data : undefined;
}

export function parseSave(raw: string, knownNation: (id: string) => boolean = () => true): ImportResult {
  if (raw.length > MAX_SAVE_BYTES) return { ok: false, error: 'Arquivo grande demais para ser um save do jogo.' };
  let file: unknown;
  try {
    file = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'O arquivo não é um JSON válido.' };
  }
  if (typeof file !== 'object' || file === null || Array.isArray(file)) return { ok: false, error: 'Arquivo não reconhecido.' };
  const f = file as Record<string, unknown>;
  if (f.format !== SAVE_FORMAT) return { ok: false, error: 'Este arquivo não é um save do NOVO Football Manager.' };
  if (typeof f.version !== 'number' || !Number.isInteger(f.version) || f.version < 1) return { ok: false, error: 'Versão do save inválida.' };
  if (f.version > SAVE_VERSION) return { ok: false, error: 'Este save é de uma versão mais nova do jogo.' };
  const data = migrate(f.version, f.data);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, error: 'Dados do save ausentes ou inválidos.' };
  const out: SaveData = {};
  for (const [k, v] of Object.entries(data)) {
    if (!Object.hasOwn(SCHEMA, k)) continue; // chave desconhecida: ignora
    const clean = SCHEMA[k as SaveKey](v);
    if (clean === undefined) return { ok: false, error: `Dados inválidos em "${k}".` };
    (out as Record<string, unknown>)[k] = clean;
  }
  const c = out.career;
  if (c) {
    const ids = [...c.entries.map((e) => e.nationId), ...(c.nationId ? [c.nationId] : []), ...(c.offers ?? []), ...(c.startOptions ?? [])];
    if (!ids.every(knownNation)) return { ok: false, error: 'A carreira cita seleções que não existem nesta versão do jogo.' };
  }
  if (out.run && !runIds(out.run).every(knownNation)) return { ok: false, error: 'A Copa salva cita seleções que não existem nesta versão do jogo.' };
  const engineVersion = typeof f.engineVersion === 'number' ? f.engineVersion : 0;
  return { ok: true, data: out, engineVersion };
}

/** Grava os dados importados (substitui o que há) depois de validados. */
export function applyImport(repo: SaveRepository, data: SaveData): void {
  for (const k of Object.keys(SCHEMA) as SaveKey[]) {
    const v = data[k];
    if (v === undefined) repo.remove(k);
    else repo.save(k, v as never);
  }
}
