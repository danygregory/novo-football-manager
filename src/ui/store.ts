/** Persistência local simples (localStorage, sem rede). Cada leitura/escrita tolera armazenamento indisponível. */
export const KEYS = {
  career: 'novo-fm-career',
  achievements: 'novo-fm-achievements',
  ranking: 'novo-fm-ranking',
  daily: 'novo-fm-daily',
  stats: 'novo-fm-stats',
} as const;

export function loadJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: o progresso vale só nesta sessão */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignora */
  }
}

/** Data local no formato aaaa-mm-dd. */
export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
