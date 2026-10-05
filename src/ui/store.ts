/** Persistência local (sem rede): um SaveRepository sobre localStorage, com leitura sempre validada. */
import { LocalTextStore, SaveRepository } from '../save';

export const repo = new SaveRepository(new LocalTextStore());

/** Data local no formato aaaa-mm-dd. */
export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
