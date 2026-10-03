import type { Decade } from '../engine/types';

export interface RawMatch {
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  tournament: string;
  neutral: boolean;
}

export const DECADES: Decade[] = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

/** Opostos abaixo deste Elo não entram nas médias "competitivas" de gols. */
export const COMPETITIVE_ELO = 1650;

export function toRawMatches(rows: Record<string, string>[]): RawMatch[] {
  const out: RawMatch[] = [];
  for (const r of rows) {
    const hs = Number(r.home_score);
    const as = Number(r.away_score);
    if (r.home_score === '' || r.away_score === '' || r.home_score === 'NA' || r.away_score === 'NA') continue;
    if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
    out.push({
      date: r.date as string,
      home: r.home_team as string,
      away: r.away_team as string,
      homeScore: hs,
      awayScore: as,
      tournament: r.tournament as string,
      neutral: r.neutral === 'TRUE',
    });
  }
  // sort estável por data: mantém a ordem do arquivo dentro do mesmo dia.
  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (a.m.date < b.m.date ? -1 : a.m.date > b.m.date ? 1 : a.i - b.i))
    .map((x) => x.m);
}

const CONTINENTAL_FINALS = new Set([
  'UEFA Euro',
  'Copa América',
  'African Cup of Nations',
  'AFC Asian Cup',
  'Gold Cup',
  'CONCACAF Championship',
  'Confederations Cup',
  'Oceania Nations Cup',
]);

/** Fator K no estilo World Football Elo. */
export function kFactor(tournament: string): number {
  if (tournament === 'FIFA World Cup') return 60;
  if (CONTINENTAL_FINALS.has(tournament)) return 50;
  if (tournament.includes('qualification') || tournament.includes('Nations League')) return 40;
  if (tournament === 'Friendly') return 20;
  return 30;
}

function goalDiffMultiplier(diff: number): number {
  if (diff <= 1) return 1;
  if (diff === 2) return 1.5;
  if (diff === 3) return 1.75;
  return 1.75 + (diff - 3) / 8;
}

const HOME_ADVANTAGE = 100;
const INITIAL_ELO = 1500;

export interface EraAccumulator {
  team: string;
  decade: Decade;
  matches: number;
  eloSum: number;
  /** Amostra competitiva (adversário com Elo >= COMPETITIVE_ELO). */
  compMatches: number;
  compGoalsFor: number;
  compGoalsAgainst: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface DecadeAccumulator {
  decade: Decade;
  matches: number;
  goals: number;
  /** Jogos entre dois times com Elo >= COMPETITIVE_ELO. */
  compMatches: number;
  compGoals: number;
}

export interface EloResult {
  eras: EraAccumulator[];
  decades: DecadeAccumulator[];
  finalRatings: Map<string, number>;
}

export function decadeOf(date: string): Decade | undefined {
  const year = Number(date.slice(0, 4));
  const d = Math.floor(year / 10) * 10;
  return d >= 1950 && d <= 2020 ? (d as Decade) : undefined;
}

/** Percorre os jogos em ordem cronológica, atualiza o Elo e acumula estatísticas por (seleção, década). */
export function computeElo(matches: RawMatch[]): EloResult {
  const ratings = new Map<string, number>();
  const eras = new Map<string, EraAccumulator>();
  const decades = new Map<Decade, DecadeAccumulator>();
  const get = (t: string) => ratings.get(t) ?? INITIAL_ELO;

  const era = (team: string, decade: Decade): EraAccumulator => {
    const key = `${team}|${decade}`;
    let e = eras.get(key);
    if (!e) {
      e = { team, decade, matches: 0, eloSum: 0, compMatches: 0, compGoalsFor: 0, compGoalsAgainst: 0, goalsFor: 0, goalsAgainst: 0 };
      eras.set(key, e);
    }
    return e;
  };

  for (const m of matches) {
    const ra = get(m.home);
    const rb = get(m.away);
    const decade = decadeOf(m.date);

    if (decade !== undefined) {
      let d = decades.get(decade);
      if (!d) {
        d = { decade, matches: 0, goals: 0, compMatches: 0, compGoals: 0 };
        decades.set(decade, d);
      }
      const total = m.homeScore + m.awayScore;
      d.matches++;
      d.goals += total;
      if (ra >= COMPETITIVE_ELO && rb >= COMPETITIVE_ELO) {
        d.compMatches++;
        d.compGoals += total;
      }
      const sides: [string, number, number, number, number][] = [
        [m.home, ra, rb, m.homeScore, m.awayScore],
        [m.away, rb, ra, m.awayScore, m.homeScore],
      ];
      for (const [team, own, opp, gf, ga] of sides) {
        const e = era(team, decade);
        e.matches++;
        e.eloSum += own;
        e.goalsFor += gf;
        e.goalsAgainst += ga;
        if (opp >= COMPETITIVE_ELO) {
          e.compMatches++;
          e.compGoalsFor += gf;
          e.compGoalsAgainst += ga;
        }
      }
    }

    const diff = (ra + (m.neutral ? 0 : HOME_ADVANTAGE)) - rb;
    const expectedHome = 1 / (1 + Math.pow(10, -diff / 400));
    const actualHome = m.homeScore > m.awayScore ? 1 : m.homeScore === m.awayScore ? 0.5 : 0;
    const delta = kFactor(m.tournament) * goalDiffMultiplier(Math.abs(m.homeScore - m.awayScore)) * (actualHome - expectedHome);
    ratings.set(m.home, ra + delta);
    ratings.set(m.away, rb - delta);
  }

  return {
    eras: [...eras.values()],
    decades: [...decades.values()].sort((a, b) => a.decade - b.decade),
    finalRatings: ratings,
  };
}
