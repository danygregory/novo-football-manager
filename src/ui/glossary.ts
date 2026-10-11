/** Termos que um jogador novo não conhece, explicados em uma frase (usados por `Term`). */
export const GLOSSARY = {
  Elo: 'Nota de força calculada de resultados reais: quanto maior, mais forte a seleção (o Brasil dos anos 70 tem 1972).',
  xG: 'Gols esperados: soma da chance de gol de cada finalização, para ver quanto perigo cada time criou.',
  pote: 'Grupo de força no sorteio da Copa: o pote 1 reúne as seleções mais fortes e o pote 4 as mais fracas.',
  draft: 'Montar o time sorteando jogadores: a cada rodada o jogo mostra opções e você escolhe uma.',
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY;

export const definitionOf = (term: GlossaryTerm): string => GLOSSARY[term];
