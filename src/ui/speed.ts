/** Velocidades de reprodução da partida ao vivo (além do instantâneo). */
export type Speed = 2 | 4;
export const SPEEDS: Speed[] = [2, 4];
export const DEFAULT_SPEED: Speed = 2;

/** Segundos de coreografia por minuto de jogo na referência (o ritmo variável escala em cima disso). */
export const TAU_PER_MIN = 1.6;
/**
 * Segundos de coreografia que passam por segundo real em cada velocidade.
 * Calibrado para ~5 a 6 min reais por partida em 2x e ~2 a 3 min em 4x, contando as desacelerações
 * nas jogadas de perigo (medido no Chrome: o relógio roda em média a 0,63 do nominal). Medido: 2x ≈ 5,8 min e 4x ≈ 2,5 min por partida.
 */
export function tauRate(speed: Speed): number {
  return speed * 0.33;
}

/** Duração nominal em minutos reais de uma partida de 90 min, sem pausas (para testes e documentação). */
export function nominalMinutes(speed: Speed, gameMinutes = 90): number {
  return (gameMinutes * TAU_PER_MIN) / tauRate(speed) / 60;
}

export function isSpeed(v: unknown): v is Speed {
  return v === 2 || v === 4;
}
