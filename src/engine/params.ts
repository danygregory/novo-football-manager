/** Parâmetros do motor. Os valores finais saem da calibração (docs/CALIBRACAO.md). */
export interface Params {
  /** Expoente dos duelos logísticos: p = A^k / (A^k + B^k). */
  k: number;
  /** Probabilidade de avançar de zona entre times iguais (viram viés multiplicativo por zona). */
  advance0: { DEF: number; MID: number; ATT: number };
  /** Média de gols por jogo que o motor produz com goalRate neutro; o ambiente da era escala a partir dela. */
  baseGoalRate: number;
  /** Expoente do ambiente de gols da era (0,5 = divide igualmente entre posses e qualidade das chances). */
  eraExp: number;
  /** Expoente da vantagem de qualidade (ataque/defesa) sobre o xG das chances. */
  qualityExp: number;
  /** Minutos simulados por passo (antes do ajuste de ritmo). */
  stepMinutes: number;
  /** Chance base de contra-ataque após perda de posse no meio/ataque. */
  counterBase: number;
  /** Chance base de bola longa a partir da defesa e sucesso entre times iguais. */
  longBallBase: number;
  longBall0: number;
  /** xG base por tipo de finalização. */
  xg: { trabalhada: number; 'contra-ataque': number; cruzamento: number; 'bola-parada': number; penalti: number };
  /** Chance de falta numa disputa perdida. */
  foulBase: number;
  /** Chance de cartão amarelo por falta e de vermelho direto. */
  yellowPerFoul: number;
  redPerFoul: number;
  /** Chance de a falta no último terço virar pênalti (na área) ou chute de falta. */
  penaltyPerBoxFoul: number;
  freeKickShot: number;
  /** Chance de escanteio após defesa/bloqueio e xG do chute resultante. */
  cornerAfterSave: number;
  /** Centros do ajuste de conversão e inclinação (logit por ponto de atributo). */
  conv: { fin: number; gk: number; slope: number };
  /** Chance base de impedimento quando a jogada chegaria à finalização (cresce com a linha alta adversária). */
  offsideBase: number;
  /** xG mínimo para a defesa contar como difícil e para o erro contar como chance clara perdida. */
  hardSaveXg: number;
  bigChanceXg: number;
  /** Fração das finalizações para fora que acertam a trave. */
  postShare: number;
  /** Intensidade dos efeitos de postura tática (0 = sem efeito). */
  tactics: {
    /** Ritmo alto aumenta a força do ataque no último terço (e reduz a precisão da construção). */
    attackTempo: number;
    /** Linha alta aproxima o time do ataque no meio-campo. */
    attackLine: number;
    /** Pressão alta aumenta a chance de contra-ataque após recuperar a bola. */
    pressRecover: number;
    /** Linha baixa deixa a defesa mais compacta contra a construção (linha alta, menos). */
    defLineCompact: number;
  };
  /** Cobrança de pênalti: erro, trave e defesa conforme o canto e o encontro com o mergulho. */
  penalty: { missLow: number; missHigh: number; post: number; saveLow: number; saveHigh: number; saveCenter: number };
  /** Chance de lesão por jogador por minuto (cresce com o cansaço). */
  injuryPerMinute: number;
  /** Fadiga por minuto: base + pressão + ritmo + altura da linha. */
  fatigue: { base: number; press: number; tempo: number; line: number };
  /** Peso da condição física na força do jogador (0 = ignora). */
  fatigueImpact: number;
}

export const DEFAULT_PARAMS: Params = {
  k: 1.597,
  advance0: { DEF: 0.92, MID: 0.609, ATT: 0.42 },
  baseGoalRate: 2.65,
  eraExp: 0.732,
  qualityExp: 0.4496,
  stepMinutes: 0.3792,
  counterBase: 0.0694,
  longBallBase: 0.1006,
  longBall0: 0.3,
  xg: { trabalhada: 0.0865, 'contra-ataque': 0.1573, cruzamento: 0.0590, 'bola-parada': 0.0472, penalti: 0.76 },
  offsideBase: 0.09,
  hardSaveXg: 0.15,
  bigChanceXg: 0.11,
  postShare: 0.07,
  tactics: { attackTempo: 0.3, attackLine: 0.2, pressRecover: 0.3, defLineCompact: 0.18 },
  penalty: { missLow: 0.04, missHigh: 0.09, post: 0.045, saveLow: 0.5, saveHigh: 0.3, saveCenter: 0.65 },
  injuryPerMinute: 0.00035,
  foulBase: 0.1,
  yellowPerFoul: 0.16,
  redPerFoul: 0.006,
  penaltyPerBoxFoul: 0.12,
  freeKickShot: 0.5,
  cornerAfterSave: 0.25,
  conv: { fin: 65, gk: 60, slope: 0.00735 },
  fatigue: { base: 0.08, press: 0.12, tempo: 0.06, line: 0.03 },
  fatigueImpact: 0.3,
};
