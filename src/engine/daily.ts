import { worldPercentile } from './career';
import { Rng, hashSeed } from './prng';
import type { CupSummary } from './scoring';
import type { NationEra, World } from './types';

/**
 * Desafio do dia: a data (aaaa-mm-dd) vira a seed. Todos recebem a mesma seleção fraca e a mesma Copa (mesmos adversários,
 * grupos e chaveamento). Tudo local: nenhuma chamada de rede e nenhum dado pessoal.
 */
export function dailySeed(dateIso: string): number {
  return hashSeed(`novo-fm-daily:${dateIso}`);
}

/** A seleção do dia: uma seleção-era do último quarto de força do mundo (pote 4). */
export function dailyTeam(world: World, dateIso: string): NationEra {
  const pool = world.nations.filter((n) => worldPercentile(world, n.elo) <= 25);
  return new Rng(dailySeed(dateIso) ^ 0x9e3779b9).pick(pool);
}

const EMOJI = { W: '🟩', D: '🟨', L: '🟥' } as const;

/**
 * Resultado compartilhável em texto, no estilo Wordle: um quadrado por jogo (verde, amarelo, vermelho), fase de grupos e
 * mata-mata separados. Só traz a data, a seleção do dia e o resultado: sem nome, sem identificador.
 */
export function shareText(dateIso: string, team: NationEra, s: CupSummary, teamLabel: string): string {
  const groups = s.matches.filter((m) => m.stage.startsWith('G')).map((m) => EMOJI[m.result]).join('');
  const knockout = s.matches.filter((m) => !m.stage.startsWith('G')).map((m) => EMOJI[m.result]).join('');
  const lines = [
    `NOVO Football Manager · Desafio ${dateIso}`,
    `Seleção do dia: ${teamLabel} (pote 4, Elo ${Math.round(team.elo)})`,
    `${groups}${knockout ? ' | ' + knockout : ''}`,
    `${s.ev.champion ? '🏆 ' : ''}${s.stageText} · ${s.ev.w}V ${s.ev.d}E ${s.ev.l}D · ${s.ev.gf}-${s.ev.ga} gols`,
    `Pontos: ${s.total}`,
  ];
  return lines.join('\n');
}

export interface DailyRecord {
  date: string;
  points: number;
  stageText: string;
  champion: boolean;
  text: string;
}

/** Guarda o melhor resultado do dia. */
export function bestOfDay(prev: DailyRecord | undefined, next: DailyRecord): DailyRecord {
  return !prev || next.points > prev.points ? next : prev;
}
