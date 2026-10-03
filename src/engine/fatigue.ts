/** Recuperação de condição entre jogos do torneio. */
export const RECOVERY_PER_DAY = 4.5;

export function recoverCondition(condition: number, days: number): number {
  return Math.min(100, Math.round((condition + RECOVERY_PER_DAY * days) * 10) / 10);
}
