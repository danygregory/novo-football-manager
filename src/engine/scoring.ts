import { clamp } from './util';
import { evaluateCup, STAGE_VALUE_LABEL, type CupEvaluation } from './career';
import { awards, nationOf, winnerOf, withCustom, type Stage, type Tournament } from './tournament';
import type { World } from './types';

/**
 * Pontuação e conquistas. Cada partida e a campanha valem mais quando o time é mais fraco que o adversário (ou que o campo):
 * vencer o favorito vale mais que vencer um time fraco.
 */
export const WIN_POINTS = 10;
export const DRAW_POINTS = 4;
export const SHOOTOUT_WIN_POINTS = 7;
/** Bônus pela etapa mais longe: grupos, oitavas, quartas, semifinal, final (vice), campeão. */
export const STAGE_BONUS = [0, 20, 40, 80, 120, 200] as const;

export interface MatchPoints {
  id: string;
  stage: Stage;
  opp: string;
  result: 'W' | 'D' | 'L';
  /** Decidido nos pênaltis (vitória ou derrota). */
  penalties: boolean;
  /** Multiplicador pela diferença de força (Elo do adversário contra o do time). */
  mult: number;
  points: number;
}

export interface CupFacts {
  champion: boolean;
  /** Pote (1 a 4) do time na Copa, por força. */
  pot: 1 | 2 | 3 | 4;
  matches: number;
  wins: number;
  losses: number;
  groupWins: number;
  qualified: boolean;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  biggestWinMargin: number;
  beatTopSeed: boolean;
  shootoutWon: boolean;
  comeback: boolean;
  topScorerMine: boolean;
  bestPlayerMine: boolean;
  customTeam: boolean;
}

export interface CupSummary {
  ev: CupEvaluation;
  stageText: string;
  matches: MatchPoints[];
  matchPoints: number;
  stageBonus: number;
  /** Multiplicador da campanha: o campo era mais forte que o time? */
  campaignMult: number;
  total: number;
  facts: CupFacts;
}


/** Multiplicador por diferença de força: +400 de Elo no adversário vale o dobro; adversário bem mais fraco vale menos da metade. */
export function strengthMult(myElo: number, oppElo: number): number {
  return clamp(1 + (oppElo - myElo) / 400, 0.35, 2.5);
}

export function summarizeCup(worldIn: World, t: Tournament): CupSummary {
  const world = withCustom(worldIn, t.custom);
  const me = t.userNationId;
  const myElo = nationOf(world, me).elo;
  const ev = evaluateCup(worldIn, t);
  const field = t.participants.map((id) => nationOf(world, id));
  const top = [...field].filter((n) => n.id !== me).sort((a, b) => b.elo - a.elo || a.id.localeCompare(b.id))[0];
  const fieldMean = field.reduce((s, n) => s + n.elo, 0) / field.length;

  const matches: MatchPoints[] = [];
  let cleanSheets = 0;
  let biggestWinMargin = 0;
  let beatTopSeed = false;
  let shootoutWon = false;
  let comeback = false;
  let groupWins = 0;
  let qualified = false;
  for (const r of t.results) {
    if (!r.teams.includes(me)) continue;
    const mine = r.teams[0] === me ? 0 : 1;
    const oppId = r.teams[mine === 0 ? 1 : 0];
    const opp = nationOf(world, oppId);
    const gf = r.score[mine];
    const ga = r.score[mine === 0 ? 1 : 0];
    const knockout = !r.stage.startsWith('G');
    const penalties = !!r.shootout;
    const won = winnerOf(r) === me && (gf > ga || penalties);
    const result: 'W' | 'D' | 'L' = gf === ga && !knockout ? 'D' : won ? 'W' : 'L';
    const base = result === 'W' ? (penalties ? SHOOTOUT_WIN_POINTS : WIN_POINTS) : result === 'D' ? DRAW_POINTS : 0;
    const mult = strengthMult(myElo, opp.elo);
    matches.push({ id: r.id, stage: r.stage, opp: oppId, result, penalties, mult: Math.round(mult * 100) / 100, points: Math.round(base * mult) });
    if (ga === 0) cleanSheets++;
    if (result === 'W' && gf > ga) biggestWinMargin = Math.max(biggestWinMargin, gf - ga);
    if (result === 'W' && opp.id === top?.id) beatTopSeed = true;
    if (result === 'W' && penalties) shootoutWon = true;
    if (!knockout && result === 'W') groupWins++;
    if (knockout) qualified = true;
    if (result === 'W') {
      const firstGoal = [...r.goals].sort((a, b) => a.minute - b.minute)[0];
      if (firstGoal && firstGoal.team !== me) comeback = true;
    }
  }
  const matchPoints = matches.reduce((s, m) => s + m.points, 0);
  const campaignMult = Math.round(clamp(1 + (fieldMean - myElo) / 300, 0.5, 3) * 100) / 100;
  const stageBonus = Math.round(STAGE_BONUS[ev.stage] * campaignMult);
  const a = awards(t);
  const topScorerTeam = a.topScorer ? t.results.flatMap((r) => r.goals).find((g) => g.playerId === a.topScorer?.playerId)?.team : undefined;
  const bestIds = a.bestPlayer?.playerId;
  const mineSquad = new Set(t.squads[me] ?? []);
  return {
    ev,
    stageText: STAGE_VALUE_LABEL[ev.stage],
    matches,
    matchPoints,
    stageBonus,
    campaignMult,
    total: matchPoints + stageBonus,
    facts: {
      champion: ev.champion,
      pot: ev.pot,
      matches: matches.length,
      wins: matches.filter((m) => m.result === 'W').length,
      losses: matches.filter((m) => m.result === 'L').length,
      groupWins,
      qualified,
      goalsFor: ev.gf,
      goalsAgainst: ev.ga,
      cleanSheets,
      biggestWinMargin,
      beatTopSeed,
      shootoutWon,
      comeback,
      topScorerMine: topScorerTeam === me,
      bestPlayerMine: !!bestIds && mineSquad.has(bestIds),
      customTeam: !!t.custom,
    },
  };
}

// ---------- conquistas ----------

export interface AchievementContext {
  /** Desafio do dia concluído nesta Copa. */
  daily?: boolean;
  /** Carreira: títulos (já contando esta Copa) e reputação depois da Copa. */
  careerTitles?: number;
  careerRep?: number;
  /** Número de Copas já registradas no ranking antes desta (para "primeira Copa"). */
  previousCups?: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  check: (s: CupSummary, c: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'primeira-copa', name: 'Estreia em Copas', description: 'Complete a sua primeira Copa.', check: (_s, c) => (c.previousCups ?? 0) === 0 },
  { id: 'campeao', name: 'Campeão da Copa', description: 'Seja campeão da Copa.', check: (s) => s.facts.champion },
  { id: 'cinderela', name: 'Cinderela', description: 'Seja campeão com uma seleção do pote 4 (entre as mais fracas da Copa).', check: (s) => s.facts.champion && s.facts.pot === 4 },
  { id: 'azarao-final', name: 'Azarão na final', description: 'Chegue à final com uma seleção do pote 4.', check: (s) => s.ev.stage >= 4 && s.facts.pot === 4 },
  { id: 'zebra-grupo', name: 'Zebra de grupo', description: 'Classifique-se para o mata-mata com uma seleção do pote 4.', check: (s) => s.facts.qualified && s.facts.pot === 4 },
  { id: 'eliminou-favorito', name: 'Eliminou o favorito', description: 'Vença a seleção mais forte da Copa.', check: (s) => s.facts.beatTopSeed },
  { id: 'invicto', name: 'Invicto na Copa', description: 'Termine a Copa sem derrotas (5 jogos ou mais).', check: (s) => s.facts.losses === 0 && s.facts.matches >= 5 },
  { id: 'grupos-perfeitos', name: 'Fase de grupos perfeita', description: 'Vença os 3 jogos da fase de grupos.', check: (s) => s.facts.groupWins === 3 },
  { id: 'muralha', name: 'Muralha', description: 'Fique 3 jogos ou mais sem sofrer gols na mesma Copa.', check: (s) => s.facts.cleanSheets >= 3 },
  { id: 'defesa-de-ferro', name: 'Defesa de ferro', description: 'Chegue à semifinal sofrendo no máximo 2 gols na Copa.', check: (s) => s.ev.stage >= 3 && s.facts.goalsAgainst <= 2 },
  { id: 'goleada', name: 'Goleada histórica', description: 'Vença um jogo por 5 gols de diferença ou mais.', check: (s) => s.facts.biggestWinMargin >= 5 },
  { id: 'festival-de-gols', name: 'Festival de gols', description: 'Marque 20 gols ou mais na mesma Copa.', check: (s) => s.facts.goalsFor >= 20 },
  { id: 'virada', name: 'Virada', description: 'Vença um jogo depois de sofrer o primeiro gol.', check: (s) => s.facts.comeback },
  { id: 'heroi-penaltis', name: 'Herói dos pênaltis', description: 'Vença um mata-mata na disputa de pênaltis.', check: (s) => s.facts.shootoutWon },
  { id: 'artilheiro', name: 'Artilheiro da Copa', description: 'Tenha o artilheiro da Copa no seu time.', check: (s) => s.facts.topScorerMine },
  { id: 'melhor-jogador', name: 'Melhor jogador da Copa', description: 'Tenha o melhor jogador da Copa no seu time.', check: (s) => s.facts.bestPlayerMine },
  { id: 'campeao-draft', name: 'Campeão do draft', description: 'Seja campeão com um time montado no draft.', check: (s) => s.facts.champion && s.facts.customTeam },
  { id: 'primeiro-titulo', name: 'Primeiro título na carreira', description: 'Conquiste o primeiro título no modo carreira.', check: (s, c) => s.facts.champion && c.careerTitles === 1 },
  { id: 'tecnico-respeitado', name: 'Técnico respeitado', description: 'Chegue a 80 de reputação na carreira.', check: (_s, c) => (c.careerRep ?? 0) >= 80 },
  { id: 'desafio-do-dia', name: 'Desafio cumprido', description: 'Complete o desafio do dia.', check: (_s, c) => !!c.daily },
  { id: 'desafio-campeao', name: 'Desafio perfeito', description: 'Seja campeão no desafio do dia.', check: (s, c) => !!c.daily && s.facts.champion },
];

/** Conquistas que a campanha desbloqueia agora e ainda não estavam desbloqueadas. */
export function newAchievements(s: CupSummary, ctx: AchievementContext, already: ReadonlySet<string>): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !already.has(a.id) && a.check(s, ctx));
}

// ---------- ranking local ----------

export interface RankingEntry {
  /** Data ISO (aaaa-mm-dd) e rótulo do modo. */
  date: string;
  mode: 'career' | 'daily' | 'draft' | 'ready';
  team: string;
  points: number;
  stageText: string;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pot: number;
  champion: boolean;
}

export const RANKING_SIZE = 20;

export function rankingEntry(s: CupSummary, mode: RankingEntry['mode'], team: string, date: string): RankingEntry {
  return { date, mode, team, points: s.total, stageText: s.stageText, w: s.ev.w, d: s.ev.d, l: s.ev.l, gf: s.ev.gf, ga: s.ev.ga, pot: s.ev.pot, champion: s.ev.champion };
}

/** Insere a campanha no ranking (melhores primeiro, no máximo RANKING_SIZE). */
export function addToRanking(list: readonly RankingEntry[], entry: RankingEntry): RankingEntry[] {
  return [...list, entry].sort((a, b) => b.points - a.points || (a.date < b.date ? -1 : 1)).slice(0, RANKING_SIZE);
}

