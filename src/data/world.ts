import { COUNTRY_BY_NAME, eraContinent, eraName, type CountryMeta } from './countries';
import { COMPETITIVE_ELO, DECADES, computeElo, toRawMatches, type TeamMatch } from './elo';
import { PEAK_MIN_YEARS, findPeaks, findWorldTopWindows, summarize, windowStats, type PeakWindow, type WindowStats } from './eras';
import { parseCsv } from './csv';
import type { Continent, Decade, DecadeStats, NationEra, PlayStyle, World } from '../engine/types';

export const WORLD_VERSION = 5;
/** Mínimo de jogos da seleção na década para virar seleção-era (ajustável por `--min` no build-world). */
export const DEFAULT_MIN_MATCHES = 15;
/** Mínimo de jogos de uma geração (4 a 8 anos): menor que o da década porque as seleções jogavam bem menos antigamente. */
export const PEAK_MIN_MATCHES = 10;

interface Candidate {
  meta: CountryMeta;
  decade: Decade;
  continent: Continent;
  acc: WindowStats;
  kind: 'decade' | 'peak';
  span: [number, number];
  entries: TeamMatch[];
  elo: number;
  /** 0 (mais fraco) a 1 (mais forte) entre candidatos da década. */
  pct: number;
  /** Só nas gerações escolhidas por estarem entre as mais fortes do mundo no período (1 a `WORLD_TOP_COUNT`). */
  worldRank?: number;
}

/** Maior trecho contínuo de anos de [from, to] que não toca as gerações `taken`; `undefined` se tiver menos de `PEAK_MIN_YEARS` anos. */
function freeSegment(from: number, to: number, taken: readonly PeakWindow[]): [number, number] | undefined {
  let best: [number, number] | undefined;
  let start: number | undefined;
  for (let y = from; y <= to + 1; y++) {
    const free = y <= to && !taken.some((p) => y >= p.from && y <= p.to);
    if (free && start === undefined) start = y;
    if (!free && start !== undefined) {
      if (!best || y - start > best[1] - best[0] + 1) best = [start, y - 1];
      start = undefined;
    }
  }
  return best && best[1] - best[0] + 1 >= PEAK_MIN_YEARS ? best : undefined;
}

export function strengthFromElo(elo: number): number {
  return Math.pow(10, (elo - 1800) / 400);
}

function classifyStyle(c: Candidate, decadeAvgGoals: number): PlayStyle {
  const comp = c.acc.compMatches >= 10;
  const n = comp ? c.acc.compMatches : c.acc.matches;
  const gf = (comp ? c.acc.compGoalsFor : c.acc.goalsFor) / n;
  const ga = (comp ? c.acc.compGoalsAgainst : c.acc.goalsAgainst) / n;
  // abertura: gols totais dos jogos da seleção vs média da década; domínio: fatia dos gols a favor.
  const openness = (gf + ga) / decadeAvgGoals;
  const share = gf / Math.max(0.01, gf + ga);
  if (share >= 0.65) return 'posse';
  if (openness >= 1.1 && share >= 0.5) return 'ofensivo';
  if (openness <= 0.92) return share >= 0.42 ? 'retranca' : 'jogo-direto';
  if (share >= 0.6) return 'posse';
  if (share < 0.5) return openness >= 1.0 ? 'contra-ataque' : 'jogo-direto';
  return 'equilibrado';
}

/**
 * Calcula o mundo inteiro a partir do conteúdo de results.csv: as décadas de 1930 a 2020 de cada seleção com jogos suficientes
 * e, além delas, as gerações (picos de 4 a 8 anos acima da média da seleção, com nome do período). Puro e determinístico.
 * Só dados da seleção: os elencos são gerados sob demanda (ver squads.ts).
 */
export function buildWorld(resultsCsv: string, minMatches = DEFAULT_MIN_MATCHES): World {
  return buildWorldAndSummaries(resultsCsv, minMatches).world;
}

/** O mundo (leve, usado pelo motor) e os resumos factuais por id (carregados só quando a tela os mostra). */
export function buildWorldAndSummaries(resultsCsv: string, minMatches = DEFAULT_MIN_MATCHES): { world: World; summaries: Record<string, string> } {
  const { eras, decades, log } = computeElo(toRawMatches(parseCsv(resultsCsv)));

  const candidates: Candidate[] = [];
  for (const acc of eras) {
    const meta = COUNTRY_BY_NAME.get(acc.team);
    if (!meta || acc.matches < minMatches) continue;
    const entries = log.filter((e) => e.team === acc.team && e.year >= acc.decade && e.year <= acc.decade + 9);
    candidates.push({ meta, decade: acc.decade, continent: eraContinent(meta, acc.decade), acc: { ...windowStats(entries) }, elo: acc.eloSum / acc.matches, pct: 0, kind: 'decade', span: [acc.decade, acc.decade + 9], entries });
  }
  const decadePool = new Map<Decade, number[]>();
  for (const decade of DECADES) {
    const group = candidates.filter((c) => c.decade === decade).sort((a, b) => a.elo - b.elo || a.meta.code.localeCompare(b.meta.code));
    group.forEach((c, i) => (c.pct = group.length > 1 ? i / (group.length - 1) : 1));
    decadePool.set(decade, group.map((c) => c.elo));
  }

  // gerações: picos de 4 a 8 anos acima da média da própria seleção
  const yearAcc = new Map<number, { n: number; sum: number }>();
  for (const e of log) {
    const a = yearAcc.get(e.year) ?? { n: 0, sum: 0 };
    a.n++;
    a.sum += e.own;
    yearAcc.set(e.year, a);
  }
  const yearMean = new Map([...yearAcc].map(([y, a]) => [y, a.sum / a.n] as const));
  const byTeam = new Map<string, typeof log>();
  for (const e of log) if (COUNTRY_BY_NAME.has(e.team)) byTeam.set(e.team, [...(byTeam.get(e.team) ?? []), e]);
  // além disso, as mais fortes do mundo em cada janela de 5 anos (o critério acima compara com a própria média e deixava de fora
  // as seleções dominantes por décadas, como o Brasil de 1970); as gerações já existentes da seleção têm prioridade, sem sobreposição
  const peakMinMatches = Math.min(minMatches, PEAK_MIN_MATCHES);
  const worldTop = findWorldTopWindows(log, (t) => COUNTRY_BY_NAME.has(t), peakMinMatches, yearMean);
  for (const [team, entries] of [...byTeam].sort((a, b) => a[0].localeCompare(b[0]))) {
    const meta = COUNTRY_BY_NAME.get(team) as CountryMeta;
    const own = findPeaks(entries, peakMinMatches, yearMean);
    const extra: PeakWindow[] = [];
    for (const w of worldTop.filter((x) => x.team === team)) {
      // a geração das mais fortes do mundo não pode sobrepor as da própria seleção: fica com o maior trecho livre, se couber (mínimo de 4 anos)
      const seg = freeSegment(w.from, w.to, own);
      if (!seg) continue;
      const slice = entries.filter((e) => e.year >= seg[0] && e.year <= seg[1]);
      if (slice.length < peakMinMatches) continue;
      extra.push({ ...w, from: seg[0], to: seg[1], matches: slice.length, meanElo: slice.reduce((s, e) => s + e.own, 0) / slice.length });
    }
    for (const peak of [...own, ...extra] as PeakWindow[]) {
      const slice = entries.filter((e) => e.year >= peak.from && e.year <= peak.to);
      const mid = Math.floor((peak.from + peak.to) / 2 / 10) * 10;
      const decade = Math.max(1930, Math.min(2020, mid)) as Decade;
      candidates.push({ meta, decade, continent: eraContinent(meta, decade), acc: windowStats(slice), elo: peak.meanElo, pct: 0, kind: 'peak', span: [peak.from, peak.to], entries: slice, worldRank: peak.worldRank });
    }
  }

  const decadeStats: DecadeStats[] = decades.map((d) => {
    const group = candidates.filter((c) => c.decade === d.decade && c.kind === 'decade');
    return {
      decade: d.decade,
      matches: d.matches,
      goalsPerMatch: round(d.goals / d.matches, 3),
      goalsPerMatchCompetitive: round(d.compMatches > 0 ? d.compGoals / d.compMatches : d.goals / d.matches, 3),
      meanElo: round(group.reduce((s, c) => s + c.elo, 0) / Math.max(1, group.length), 1),
    };
  });
  const avgGoals = new Map(decadeStats.map((d) => [d.decade, d.goalsPerMatchCompetitive]));

  const summaries: Record<string, string> = {};
  const nations: NationEra[] = candidates
    .sort((a, b) => a.decade - b.decade || b.elo - a.elo || a.meta.code.localeCompare(b.meta.code) || a.span[0] - b.span[0])
    .map((c) => {
      const peak = c.kind === 'peak';
      const id = peak ? `${c.meta.code}-${c.span[0]}-${c.span[1]}` : `${c.meta.code}-${c.decade}`;
      const comp = c.acc.compMatches >= 10;
      const n = comp ? c.acc.compMatches : c.acc.matches;
      const elo = round(c.elo, 1);
      const pool = decadePool.get(c.decade) ?? [];
      const percentile = pool.length ? Math.round((100 * pool.filter((e) => e <= elo + (peak ? 0 : 0.05)).length) / pool.length) : 50;
      const country = eraName(c.meta, c.decade);
      const label = peak ? `${country} ${c.span[0]}–${String(c.span[1]).slice(2)}` : `${country} anos ${String(c.decade).slice(2)}`;
      const rankText = peak
        ? c.worldRank
          ? `Uma das seleções mais fortes do mundo no período (Elo ${Math.round(elo)}), a ${c.worldRank}ª em força entre todas as seleções de ${c.span[0]} a ${c.span[1]}, no nível do percentil ${percentile} da década de ${c.decade}.`
          : `Geração acima da média histórica da seleção (Elo ${Math.round(elo)}), no nível do percentil ${percentile} da década de ${c.decade}.`
        : `${rankInDecade(pool, elo)}ª entre as ${pool.length} seleções da década, com Elo médio ${Math.round(elo)}.`;
      summaries[id] = summarize(c.entries, peak ? `${label.replace(country + ' ', '')}` : `${c.decade}–${String(c.decade + 9).slice(2)}`, rankText);
      return {
        id,
        code: c.meta.code,
        culture: c.meta.culture,
        country,
        decade: c.decade,
        continent: c.continent,
        elo,
        strength: round(strengthFromElo(elo), 4),
        playStyle: classifyStyle(c, avgGoals.get(c.decade) as number),
        goalsFor: round((comp ? c.acc.compGoalsFor : c.acc.goalsFor) / n, 3),
        goalsAgainst: round((comp ? c.acc.compGoalsAgainst : c.acc.goalsAgainst) / n, 3),
        colors: { primary: c.meta.colors[0], secondary: c.meta.colors[1] },
        matches: c.acc.matches,
        kind: c.kind,
        span: c.span,
        percentile,
        record: c.acc.record,
      };
    });

  return { world: { version: WORLD_VERSION, generatedFrom: 'martj42/international_results (CC0)', decades: decadeStats, nations }, summaries };
}

/** Posição (1 = mais forte) do Elo entre os da década. */
function rankInDecade(pool: number[], elo: number): number {
  return 1 + pool.filter((e) => e > elo + 0.05).length;
}

function round(v: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export { COMPETITIVE_ELO };
