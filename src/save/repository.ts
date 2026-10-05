import * as g from './guards';

/** Dados persistidos do jogo e o guard que valida cada um ao ler. */
export const SCHEMA = {
  career: g.career,
  achievements: g.achievements,
  ranking: g.ranking,
  daily: g.daily,
  stats: g.stats,
  settings: g.settings,
} as const;
export type SaveKey = keyof typeof SCHEMA;
export type SaveData = { [K in SaveKey]?: NonNullable<ReturnType<(typeof SCHEMA)[K]>> };

export const STORAGE_KEY: Record<SaveKey, string> = {
  career: 'novo-fm-career',
  achievements: 'novo-fm-achievements',
  ranking: 'novo-fm-ranking',
  daily: 'novo-fm-daily',
  stats: 'novo-fm-stats',
  settings: 'novo-fm-settings',
};

/** Armazenamento de texto por chave. A Fase 7 acrescenta uma implementação sobre IndexedDB para as Copas em andamento. */
export interface TextStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class LocalTextStore implements TextStore {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* sem armazenamento: o progresso vale só nesta sessão */
    }
  }
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignora */
    }
  }
}

export class MemoryTextStore implements TextStore {
  readonly map = new Map<string, string>();
  get(key: string) {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string) {
    this.map.set(key, value);
  }
  remove(key: string) {
    this.map.delete(key);
  }
}

/** Leitura sempre validada (dado corrompido ou adulterado vira `undefined`), escrita em JSON. */
export class SaveRepository {
  constructor(private readonly store: TextStore) {}

  load<K extends SaveKey>(key: K): SaveData[K] | undefined {
    const raw = this.store.get(STORAGE_KEY[key]);
    if (!raw) return undefined;
    try {
      return SCHEMA[key](JSON.parse(raw)) as SaveData[K] | undefined;
    } catch {
      return undefined;
    }
  }

  save<K extends SaveKey>(key: K, value: SaveData[K]): void {
    this.store.set(STORAGE_KEY[key], JSON.stringify(value));
  }

  remove(key: SaveKey): void {
    this.store.remove(STORAGE_KEY[key]);
  }

  /** Tudo o que há salvo, já validado. */
  snapshot(): SaveData {
    const out: SaveData = {};
    for (const k of Object.keys(SCHEMA) as SaveKey[]) {
      const v = this.load(k);
      if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
    return out;
  }
}
