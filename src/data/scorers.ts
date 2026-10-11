import { parseCsv } from './csv';

/**
 * Concentração de gols de uma seleção-era a partir de data/raw/goalscorers.csv (martj42/international_results, CC0): a parte dos gols
 * marcados pelo artilheiro principal. Seleções de um craque artilheiro (Noruega 2020, Portugal 1960) ficam acima de seleções de gols
 * espalhados (Brasil 1970). O arquivo só traz o artilheiro de uma parte dos jogos (14% dos gols dos anos 30, 24% nos 70, 49% nos anos 20),
 * mas sempre jogos inteiros, então a proporção dentro dos jogos registrados vale; com poucos gols ela é ruidosa, por isso vem encolhida.
 * Os nomes dos artilheiros só servem para somar: nenhum nome chega ao world.json nem ao jogo (os elencos são fictícios).
 */
export interface ScorerGoal {
  team: string;
  year: number;
  scorer: string;
}

/** Mediana, entre seleções-década com 40 gols ou mais, da parte do artilheiro principal. */
export const TOP_SHARE_MEDIAN = 0.17;
/** Peso da mediana, em gols: com N gols registrados, a medida pesa N / (N + 40) e a mediana o resto. */
export const TOP_SHARE_PRIOR_GOALS = 40;
/** Menos gols que isso: não mede (a seleção-era fica sem a medida, o que o elenco trata como "típica"). */
export const TOP_SHARE_MIN_GOALS = 10;

/** Gols por seleção (nome do results.csv), em ordem do arquivo; gols contra ficam de fora. */
export function scorerIndex(csv: string): Map<string, ScorerGoal[]> {
  const out = new Map<string, ScorerGoal[]>();
  for (const r of parseCsv(csv)) {
    if (r.own_goal === 'TRUE' || !r.team || !r.scorer) continue;
    const year = Number((r.date ?? '').slice(0, 4));
    if (!Number.isInteger(year)) continue;
    const list = out.get(r.team) ?? [];
    list.push({ team: r.team, year, scorer: r.scorer });
    out.set(r.team, list);
  }
  return out;
}

/** Parte dos gols do artilheiro principal entre `from` e `to` (anos inclusivos), encolhida para a mediana; `undefined` com poucos gols. */
export function topShare(index: Map<string, ScorerGoal[]>, team: string, from: number, to: number): number | undefined {
  const goals = (index.get(team) ?? []).filter((g) => g.year >= from && g.year <= to);
  if (goals.length < TOP_SHARE_MIN_GOALS) return undefined;
  const byScorer = new Map<string, number>();
  for (const g of goals) byScorer.set(g.scorer, (byScorer.get(g.scorer) ?? 0) + 1);
  const raw = Math.max(...byScorer.values()) / goals.length;
  const w = goals.length / (goals.length + TOP_SHARE_PRIOR_GOALS);
  return Math.round((TOP_SHARE_MEDIAN + (raw - TOP_SHARE_MEDIAN) * w) * 100) / 100;
}
