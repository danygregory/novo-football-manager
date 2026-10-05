import type { CupSummary } from '../engine/scoring';
import type { CardData } from './card';

export interface CupShareInput {
  summary: CupSummary;
  team: string;
  era: string;
  colors: { primary: string; secondary: string };
  /** "Copa", "Desafio do dia · 2026-10-05"... */
  mode: string;
  /** Link do desafio (com hash); ausente para times montados no draft. */
  link?: string;
  /** Endereço do jogo sem hash, para o rodapé da imagem. */
  url: string;
}

const EMOJI = { W: '🟩', D: '🟨', L: '🟥' } as const;

/** Texto e imagem do resultado de uma Copa. Nunca inclui nomes de jogadores. */
export function cupShare(i: CupShareInput): { text: string; card: CardData } {
  const { ev, total, stageText } = i.summary;
  const record = `${ev.w}V ${ev.d}E ${ev.l}D · ${ev.gf}–${ev.ga} gols`;
  const row = (pred: (stage: string) => boolean) => i.summary.matches.filter((m) => pred(m.stage)).map((m) => EMOJI[m.result]).join('');
  const groups = row((st) => st.startsWith('G'));
  const knockout = row((st) => !st.startsWith('G'));
  const lines = [
    `NOVO Football Manager · ${i.mode}`,
    ...(groups ? [`${groups}${knockout ? ' | ' + knockout : ''}`] : []),
    `${ev.champion ? '🏆 ' : ''}${i.team} ${i.era}: ${stageText} · ${record} · ${total} pts`,
    i.link ? `Consegue fazer melhor? ${i.link}` : `Jogue em ${i.url}`,
  ];
  return {
    text: lines.join('\n'),
    card: {
      mode: i.mode,
      team: i.team,
      era: i.era,
      colors: i.colors,
      headline: ev.champion ? 'Campeã do mundo' : stageText,
      champion: ev.champion,
      record,
      points: total,
      cta: i.link ? 'Consegue fazer melhor?' : 'Monte a sua seleção histórica',
      url: i.url.replace(/^https?:\/\//, ''),
    },
  };
}
