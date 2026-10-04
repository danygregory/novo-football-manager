import { COUNTRY_BY_NAME, eraName } from './countries';
import { COMPETITIVE_ELO, type TeamMatch } from './elo';
import type { Decade } from '../engine/types';

/** Janela de geração: período de 4 a 8 anos em que a seleção jogou bem acima da própria média. */
export interface PeakWindow {
  team: string;
  from: number;
  to: number;
  matches: number;
  meanElo: number;
  /** Quanto a média da janela passa da média da seleção (pontos de Elo). */
  gain: number;
}

export const PEAK_MIN_YEARS = 4;
export const PEAK_MAX_YEARS = 8;
export const PEAK_MIN_GAIN = 55;

/**
 * Detecta os picos de geração de uma seleção: janelas de 4 a 8 anos com pelo menos `minMatches` jogos e Elo médio
 * pelo menos `minGain` acima da média da própria seleção. O Elo é medido relativo à média de todas as seleções no mesmo ano
 * (`yearMean`), para que a inflação do Elo ao longo dos anos não faça toda geração recente parecer um pico.
 * Escolhe as melhores janelas sem sobreposição.
 */
export function findPeaks(entries: TeamMatch[], minMatches: number, yearMean: Map<number, number>, minGain = PEAK_MIN_GAIN): PeakWindow[] {
  if (entries.length === 0) return [];
  const team = (entries[0] as TeamMatch).team;
  const years = new Map<number, { n: number; sum: number }>();
  let total = 0;
  for (const e of entries) {
    const rel = e.own - (yearMean.get(e.year) ?? e.own);
    const y = years.get(e.year) ?? { n: 0, sum: 0 };
    y.n++;
    y.sum += rel;
    years.set(e.year, y);
    total += rel;
  }
  const mean = total / entries.length; // média relativa da seleção
  const ys = [...years.keys()].sort((a, b) => a - b);
  const first = ys[0] as number;
  const last = ys[ys.length - 1] as number;
  const cands: PeakWindow[] = [];
  for (let len = PEAK_MIN_YEARS; len <= PEAK_MAX_YEARS; len++) {
    for (let s = first; s + len - 1 <= last; s++) {
      let n = 0;
      let sum = 0;
      for (let y = s; y < s + len; y++) {
        const v = years.get(y);
        if (v) {
          n += v.n;
          sum += v.sum;
        }
      }
      if (n < minMatches) continue;
      const m = sum / n;
      if (m - mean >= minGain) {
        let abs = 0;
        for (const e of entries) if (e.year >= s && e.year < s + len) abs += e.own;
        cands.push({ team, from: s, to: s + len - 1, matches: n, meanElo: abs / n, gain: m - mean });
      }
    }
  }
  // melhores primeiro; empate: janela mais longa e depois a mais antiga
  cands.sort((a, b) => b.gain - a.gain || b.to - b.from - (a.to - a.from) || a.from - b.from);
  const chosen: PeakWindow[] = [];
  for (const c of cands) if (!chosen.some((p) => c.from <= p.to && c.to >= p.from)) chosen.push(c);
  return chosen.sort((a, b) => a.from - b.from);
}

export interface EraRecord {
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
}

export interface WindowStats {
  matches: number;
  eloSum: number;
  compMatches: number;
  compGoalsFor: number;
  compGoalsAgainst: number;
  goalsFor: number;
  goalsAgainst: number;
  record: EraRecord;
}

export function windowStats(entries: TeamMatch[]): WindowStats {
  const s: WindowStats = { matches: 0, eloSum: 0, compMatches: 0, compGoalsFor: 0, compGoalsAgainst: 0, goalsFor: 0, goalsAgainst: 0, record: { w: 0, d: 0, l: 0, gf: 0, ga: 0 } };
  for (const e of entries) {
    s.matches++;
    s.eloSum += e.own;
    s.goalsFor += e.gf;
    s.goalsAgainst += e.ga;
    if (e.oppElo >= COMPETITIVE_ELO) {
      s.compMatches++;
      s.compGoalsFor += e.gf;
      s.compGoalsAgainst += e.ga;
    }
    s.record.gf += e.gf;
    s.record.ga += e.ga;
    if (e.gf > e.ga) s.record.w++;
    else if (e.gf === e.ga) s.record.d++;
    else s.record.l++;
  }
  return s;
}

const decadeOfYear = (y: number): Decade => (Math.floor(y / 10) * 10) as Decade;

function opponentName(opp: string, year: number): string {
  const meta = COUNTRY_BY_NAME.get(opp);
  return meta ? eraName(meta, decadeOfYear(year)) : opp;
}

const pt = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

/**
 * Resumo factual da campanha real no período, escrito só a partir de resultados (sem nomes de jogadores):
 * campanha, gols, maior vitória, maior sequência invicta e participações em Copas do Mundo.
 */
export function summarize(entries: TeamMatch[], label: string, rankText: string): string {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const st = windowStats(sorted);
  const { w, d, l, gf, ga } = st.record;
  const parts: string[] = [];
  parts.push(`${label}: ${st.matches} jogos, ${w} vitórias, ${d} empates e ${l} derrotas; ${gf} gols marcados e ${ga} sofridos (${pt(gf / st.matches)} e ${pt(ga / st.matches)} por jogo).`);
  const big = sorted.filter((e) => e.gf > e.ga).sort((a, b) => b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf)[0];
  if (big && big.gf - big.ga >= 3) parts.push(`Maior vitória: ${big.gf} a ${big.ga} sobre ${opponentName(big.opp, big.year)} (${big.year}).`);
  let run = 0;
  let best = 0;
  for (const e of sorted) {
    run = e.gf >= e.ga ? run + 1 : 0;
    best = Math.max(best, run);
  }
  if (best >= 8) parts.push(`Sequência invicta de ${best} jogos.`);
  const cups = new Map<number, TeamMatch[]>();
  for (const e of sorted) if (e.tournament === 'FIFA World Cup') cups.set(e.year, [...(cups.get(e.year) ?? []), e]);
  const cupTexts: string[] = [];
  for (const [year, games] of cups) {
    const cw = games.filter((g) => g.gf > g.ga).length;
    const cd = games.filter((g) => g.gf === g.ga).length;
    const cl = games.length - cw - cd;
    const lastGame = games[games.length - 1] as TeamMatch;
    const lastText = lastGame.gf > lastGame.ga ? `vitória sobre ${opponentName(lastGame.opp, year)} por ${lastGame.gf} a ${lastGame.ga}` : lastGame.gf === lastGame.ga ? `empate com ${opponentName(lastGame.opp, year)} por ${lastGame.gf} a ${lastGame.ga}` : `derrota para ${opponentName(lastGame.opp, year)} por ${lastGame.ga} a ${lastGame.gf}`;
    cupTexts.push(`Copa de ${year}: ${games.length} jogos (${cw}V ${cd}E ${cl}D), último jogo: ${lastText}`);
  }
  if (cupTexts.length) parts.push(cupTexts.slice(0, 2).join('. ') + '.');
  parts.push(rankText);
  return parts.join(' ');
}
