/** Parâmetros do motor. Os valores finais saem da calibração (docs/CALIBRACAO.md). */
export interface Params {
  /** Expoente dos duelos logísticos: p = A^k / (A^k + B^k). */
  k: number;
  /** Probabilidade de avançar de zona entre times iguais (viram viés multiplicativo por zona). */
  advance0: { DEF: number; MID: number; ATT: number };
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
  /** Fadiga por minuto: base + pressão + ritmo + altura da linha. */
  fatigue: { base: number; press: number; tempo: number; line: number };
  /** Peso da condição física na força do jogador (0 = ignora). */
  fatigueImpact: number;
}

export const DEFAULT_PARAMS: Params = {
  k: 2,
  advance0: { DEF: 0.78, MID: 0.62, ATT: 0.42 },
  stepMinutes: 0.4,
  counterBase: 0.1,
  longBallBase: 0.1,
  longBall0: 0.3,
  xg: { trabalhada: 0.11, 'contra-ataque': 0.2, cruzamento: 0.075, 'bola-parada': 0.06, penalti: 0.76 },
  foulBase: 0.1,
  yellowPerFoul: 0.16,
  redPerFoul: 0.006,
  penaltyPerBoxFoul: 0.12,
  freeKickShot: 0.5,
  cornerAfterSave: 0.25,
  conv: { fin: 65, gk: 60, slope: 0.035 },
  fatigue: { base: 0.08, press: 0.12, tempo: 0.06, line: 0.03 },
  fatigueImpact: 0.3,
};
