import { COUNTRY_BY_NAME, eraContinent, eraName, type CountryMeta } from './countries';
import { COMPETITIVE_ELO, DECADES, computeElo, toRawMatches, type EraAccumulator } from './elo';
import { parseCsv } from './csv';
import { generateSquad } from './squad';
import type { Continent, Decade, DecadeStats, NationEra, PlayStyle, World } from '../engine/types';

export const WORLD_VERSION = 1;
const MIN_MATCHES = 15;

/** Meta de seleções-era por continente (soma 32). */
const CONTINENT_QUOTA: Record<Continent, number> = { EU: 11, SA: 6, AF: 5, AS: 5, NA: 4, OC: 1 };
const MAX_PER_COUNTRY = 2;
const PICKS_PER_DECADE = 4;
/** Janelas de ranking (por Elo dentro da década) de onde sai cada uma das 4 vagas: topo, vice, meio, fraco. */
const WINDOWS: [number, number][] = [[0, 6], [0, 14], [8, 22], [16, 40]];

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

function selectCandidates(all: Candidate[]): Candidate[] {
  const chosen: Candidate[] = [];
  const continentCount: Record<string, number> = {};
  const countryCount: Record<string, number> = {};

  const allowed = (c: Candidate, strictContinent: boolean) =>
    (countryCount[c.meta.code] ?? 0) < MAX_PER_COUNTRY &&
    (!strictContinent || (continentCount[c.continent] ?? 0) < CONTINENT_QUOTA[c.continent]);

  for (let slot = 0; slot < PICKS_PER_DECADE; slot++) {
    for (const decade of DECADES) {
      const ranked = all.filter((c) => c.decade === decade).sort((a, b) => b.elo - a.elo || a.meta.code.localeCompare(b.meta.code));
      const taken = new Set(chosen.filter((c) => c.decade === decade).map((c) => c.meta.code));
      const [lo, hi] = WINDOWS[slot] as [number, number];
      const inWindow = (c: Candidate) => !taken.has(c.meta.code) && ranked.indexOf(c) >= lo && ranked.indexOf(c) < hi;
      let pool = ranked.filter((c) => inWindow(c) && allowed(c, true));
      // vagas do meio/fraco priorizam o continente com mais cota sobrando.
      if (slot >= 2 && pool.length > 0) {
        const need = (c: Candidate) => CONTINENT_QUOTA[c.continent] - (continentCount[c.continent] ?? 0);
        const best = Math.max(...pool.map(need));
        pool = pool.filter((c) => need(c) === best);
      }
      if (pool.length === 0) pool = ranked.filter((c) => !taken.has(c.meta.code) && allowed(c, true));
      if (pool.length === 0) pool = ranked.filter((c) => !taken.has(c.meta.code) && allowed(c, false));
      const pick = pool[0];
      if (!pick) throw new Error(`Sem candidato para ${decade} (vaga ${slot})`);
      chosen.push(pick);
      continentCount[pick.continent] = (continentCount[pick.continent] ?? 0) + 1;
      countryCount[pick.meta.code] = (countryCount[pick.meta.code] ?? 0) + 1;
    }
  }
  return chosen;
}

/** Calcula o mundo inteiro a partir do conteúdo de results.csv. Puro e determinístico. */
export function buildWorld(resultsCsv: string): World {
  const { eras, decades } = computeElo(toRawMatches(parseCsv(resultsCsv)));

  const candidates: Candidate[] = [];
  for (const acc of eras) {
    const meta = COUNTRY_BY_NAME.get(acc.team);
    if (!meta || acc.matches < MIN_MATCHES) continue;
    candidates.push({ meta, decade: acc.decade, continent: eraContinent(meta, acc.decade), acc, elo: acc.eloSum / acc.matches, pct: 0 });
  }
  for (const decade of DECADES) {
    const group = candidates.filter((c) => c.decade === decade).sort((a, b) => a.elo - b.elo);
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

  const nations: NationEra[] = selectCandidates(candidates)
    .sort((a, b) => a.decade - b.decade || b.elo - a.elo)
    .map((c) => {
      const id = `${c.meta.code}-${c.decade}`;
      const playStyle = classifyStyle(c, avgGoals.get(c.decade) as number);
      const comp = c.acc.compMatches >= 10;
      const n = comp ? c.acc.compMatches : c.acc.matches;
      const elo = round(c.elo, 1);
      return {
        id,
        country: eraName(c.meta, c.decade),
        decade: c.decade,
        continent: c.continent,
        elo,
        strength: round(strengthFromElo(elo), 4),
        playStyle,
        goalsFor: round((comp ? c.acc.compGoalsFor : c.acc.goalsFor) / n, 3),
        goalsAgainst: round((comp ? c.acc.compGoalsAgainst : c.acc.goalsAgainst) / n, 3),
        colors: { primary: c.meta.colors[0], secondary: c.meta.colors[1] },
        squad: generateSquad({ nationId: id, culture: c.meta.culture, decade: c.decade, elo, playStyle }),
      };
    });

  return { version: WORLD_VERSION, generatedFrom: 'martj42/international_results (CC0)', decades: decadeStats, nations };
}

function round(v: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export { COMPETITIVE_ELO };
