import { COUNTRY_BY_NAME, eraContinent, eraName, type CountryMeta } from './countries';
import { COMPETITIVE_ELO, DECADES, computeElo, toRawMatches, type EraAccumulator } from './elo';
import { parseCsv } from './csv';
import type { Continent, Decade, DecadeStats, NationEra, PlayStyle, World } from '../engine/types';

export const WORLD_VERSION = 2;
/** Mínimo de jogos da seleção na década para virar seleção-era (ajustável por `--min` no build-world). */
export const DEFAULT_MIN_MATCHES = 15;

interface Candidate {
  meta: CountryMeta;
  decade: Decade;
  continent: Continent;
  acc: EraAccumulator;
  elo: number;
  /** 0 (mais fraco) a 1 (mais forte) entre candidatos da década. */
  pct: number;
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
 * Calcula o mundo inteiro a partir do conteúdo de results.csv: todas as seleções-era (1930 a 2020) com jogos suficientes
 * na década. Puro e determinístico. Só dados da seleção: os elencos são gerados sob demanda (ver squads.ts).
 */
export function buildWorld(resultsCsv: string, minMatches = DEFAULT_MIN_MATCHES): World {
  const { eras, decades } = computeElo(toRawMatches(parseCsv(resultsCsv)));

  const candidates: Candidate[] = [];
  for (const acc of eras) {
    const meta = COUNTRY_BY_NAME.get(acc.team);
    if (!meta || acc.matches < minMatches) continue;
    candidates.push({ meta, decade: acc.decade, continent: eraContinent(meta, acc.decade), acc, elo: acc.eloSum / acc.matches, pct: 0 });
  }
  for (const decade of DECADES) {
    const group = candidates.filter((c) => c.decade === decade).sort((a, b) => a.elo - b.elo || a.meta.code.localeCompare(b.meta.code));
    group.forEach((c, i) => (c.pct = group.length > 1 ? i / (group.length - 1) : 1));
  }

  const decadeStats: DecadeStats[] = decades.map((d) => {
    const group = candidates.filter((c) => c.decade === d.decade);
    return {
      decade: d.decade,
      matches: d.matches,
      goalsPerMatch: round(d.goals / d.matches, 3),
      goalsPerMatchCompetitive: round(d.compMatches > 0 ? d.compGoals / d.compMatches : d.goals / d.matches, 3),
      meanElo: round(group.reduce((s, c) => s + c.elo, 0) / Math.max(1, group.length), 1),
    };
  });
  const avgGoals = new Map(decadeStats.map((d) => [d.decade, d.goalsPerMatchCompetitive]));

  const nations: NationEra[] = candidates
    .sort((a, b) => a.decade - b.decade || b.elo - a.elo || a.meta.code.localeCompare(b.meta.code))
    .map((c) => {
      const id = `${c.meta.code}-${c.decade}`;
      const comp = c.acc.compMatches >= 10;
      const n = comp ? c.acc.compMatches : c.acc.matches;
      const elo = round(c.elo, 1);
      return {
        id,
        code: c.meta.code,
        culture: c.meta.culture,
        country: eraName(c.meta, c.decade),
        decade: c.decade,
        continent: c.continent,
        elo,
        strength: round(strengthFromElo(elo), 4),
        playStyle: classifyStyle(c, avgGoals.get(c.decade) as number),
        goalsFor: round((comp ? c.acc.compGoalsFor : c.acc.goalsFor) / n, 3),
        goalsAgainst: round((comp ? c.acc.compGoalsAgainst : c.acc.goalsAgainst) / n, 3),
        colors: { primary: c.meta.colors[0], secondary: c.meta.colors[1] },
        matches: c.acc.matches,
      };
    });

  return { version: WORLD_VERSION, generatedFrom: 'martj42/international_results (CC0)', decades: decadeStats, nations };
}

function round(v: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export { COMPETITIVE_ELO };
