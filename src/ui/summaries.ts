import { useEffect, useState } from 'react';
import type { NationEra } from '../engine/types';

let cache: Promise<Record<string, string>> | undefined;

/** Resumos factuais das seleções-era: um arquivo à parte, baixado só quando uma tela precisa dele. */
export function loadSummaries(): Promise<Record<string, string>> {
  cache ??= import('../../data/summaries.json').then((m) => m.default as Record<string, string>);
  return cache;
}

/** Resumo da seleção-era (vazio enquanto carrega). Times do draft trazem o próprio. */
export function useSummary(n: NationEra | undefined): string {
  const [all, setAll] = useState<Record<string, string> | undefined>();
  useEffect(() => {
    if (!n || n.summary) return;
    let alive = true;
    void loadSummaries().then((s) => alive && setAll(s));
    return () => {
      alive = false;
    };
  }, [n]);
  return n?.summary ?? (n && all ? (all[n.id] ?? '') : '');
}
