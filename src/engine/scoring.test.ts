import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { squadOf } from '../data/squads';
import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import { simulateMatch } from './match';
import {
  ACHIEVEMENTS,
  RANKING_SIZE,
  STAGE_BONUS,
  addToRanking,
  newAchievements,
  rankingEntry,
  strengthMult,
  summarizeCup,
  type CupFacts,
  type CupSummary,
} from './scoring';
import { buildSetup, createTournament, fixtureSeed, playRemaining, playRound, userFixture, type Tournament } from './tournament';
import type { World } from './types';

const world = worldJson as unknown as World;

function cup(nationId: string, seed: number): Tournament {
  const n = world.nations.find((x) => x.id === nationId)!;
  const squad = autoSquad23(squadOf(n));
  let t = createTournament(world, nationId, squad.map((p) => p.id), autoLineup(nationId, squad, tacticsForStyle(n.playStyle)), seed, { cut: 'all' });
  while (t.stage !== 'DONE') {
    const mine = userFixture(t, world);
    if (!mine) return playRemaining(world, t);
    const report = simulateMatch([buildSetup(world, t, mine.home, false), buildSetup(world, t, mine.away, false)], { seed: fixtureSeed(t, mine), knockout: !t.stage.startsWith('G'), detail: 'summary' });
    t = playRound(world, t, report).tournament;
  }
  return t;
}

const facts = (over: Partial<CupFacts> = {}): CupFacts => ({ champion: false, pot: 2, matches: 4, wins: 2, losses: 1, groupWins: 1, qualified: true, goalsFor: 5, goalsAgainst: 4, cleanSheets: 1, biggestWinMargin: 2, beatTopSeed: false, shootoutWon: false, comeback: false, topScorerMine: false, bestPlayerMine: false, customTeam: false, ...over });
const summary = (f: Partial<CupFacts> = {}, stage = 2): CupSummary => ({
  ev: { stage: stage as 0, w: 2, d: 0, l: 1, gf: 5, ga: 4, perf: 0, expectedStage: 1.2, pot: 2, rank: 10, champion: false },
  stageText: 'x',
  matches: [],
  matchPoints: 0,
  stageBonus: 0,
  campaignMult: 1,
  total: 0,
  facts: facts(f),
});

describe('pontuação', () => {
  it('vencer o favorito vale mais: o multiplicador cresce com a diferença de força e tem limites', () => {
    expect(strengthMult(1700, 2100)).toBeGreaterThan(strengthMult(1700, 1700));
    expect(strengthMult(1700, 1700)).toBe(1);
    expect(strengthMult(2100, 1700)).toBeLessThan(1);
    expect(strengthMult(1000, 2400)).toBe(2.5);
    expect(strengthMult(2400, 1000)).toBe(0.35);
  });

  it('o total é a soma dos pontos dos jogos com o bônus da etapa multiplicado pelo campo', () => {
    for (const seed of [1, 2, 3, 4]) {
      const t = cup('BRA-1970', seed);
      const s = summarizeCup(world, t);
      expect(s.total).toBe(s.matchPoints + s.stageBonus);
      expect(s.matchPoints).toBe(s.matches.reduce((a, m) => a + m.points, 0));
      expect(s.stageBonus).toBe(Math.round(STAGE_BONUS[s.ev.stage] * s.campaignMult));
      expect(s.matches).toHaveLength(s.ev.w + s.ev.d + s.ev.l);
      for (const m of s.matches) {
        expect(m.points).toBeGreaterThanOrEqual(0);
        if (m.result === 'L') expect(m.points).toBe(0);
      }
      expect(s.facts.cleanSheets).toBeLessThanOrEqual(s.matches.length);
      expect(s.facts.wins).toBe(s.matches.filter((m) => m.result === 'W').length);
    }
  });

  it('o time fraco leva multiplicador de campanha maior que o forte e pontua mais com o mesmo resultado', () => {
    const weak = summarizeCup(world, cup(world.nations.filter((n) => n.elo < 1500)[0]!.id, 3));
    const strong = summarizeCup(world, cup(world.nations.slice().sort((a, b) => b.elo - a.elo)[0]!.id, 3));
    expect(weak.campaignMult).toBeGreaterThan(strong.campaignMult);
    // mesma campanha (campeão) vale mais para o fraco do que para o favorito
    const bonusWeak = Math.round(STAGE_BONUS[5] * weak.campaignMult);
    const bonusStrong = Math.round(STAGE_BONUS[5] * strong.campaignMult);
    expect(bonusWeak).toBeGreaterThan(bonusStrong);
  });
});

describe('conquistas', () => {
  it('há pelo menos 15 conquistas, com ids únicos, nomes e descrições', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length).toBeGreaterThan(3);
      expect(a.description.length).toBeGreaterThan(10);
    }
  });

  const ids = (s: CupSummary, ctx = {}, already: string[] = []) => newAchievements(s, ctx, new Set(already)).map((a) => a.id);

  it('campeão com seleção do pote 4 desbloqueia Cinderela, campeão, azarão na final e zebra de grupo', () => {
    const got = ids({ ...summary({ champion: true, pot: 4 }, 5), ev: { ...summary().ev, stage: 5, champion: true, pot: 4 } });
    expect(got).toEqual(expect.arrayContaining(['campeao', 'cinderela', 'azarao-final', 'zebra-grupo']));
    expect(ids(summary({ champion: true, pot: 1 }, 5))).not.toContain('cinderela');
  });

  it('cada fato dispara a conquista certa', () => {
    expect(ids(summary({ beatTopSeed: true }))).toContain('eliminou-favorito');
    expect(ids(summary({ losses: 0, matches: 7 }))).toContain('invicto');
    expect(ids(summary({ losses: 0, matches: 3 }))).not.toContain('invicto');
    expect(ids(summary({ groupWins: 3 }))).toContain('grupos-perfeitos');
    expect(ids(summary({ cleanSheets: 3 }))).toContain('muralha');
    expect(ids(summary({ goalsAgainst: 2 }, 3))).toContain('defesa-de-ferro');
    expect(ids(summary({ goalsAgainst: 2 }, 1))).not.toContain('defesa-de-ferro');
    expect(ids(summary({ biggestWinMargin: 5 }))).toContain('goleada');
    expect(ids(summary({ goalsFor: 20 }))).toContain('festival-de-gols');
    expect(ids(summary({ comeback: true }))).toContain('virada');
    expect(ids(summary({ shootoutWon: true }))).toContain('heroi-penaltis');
    expect(ids(summary({ topScorerMine: true }))).toContain('artilheiro');
    expect(ids(summary({ bestPlayerMine: true }))).toContain('melhor-jogador');
    expect(ids(summary({ champion: true, customTeam: true }, 5))).toContain('campeao-draft');
  });

  it('conquistas de carreira e de desafio dependem do contexto', () => {
    expect(ids(summary({ champion: true }, 5), { careerTitles: 1 })).toContain('primeiro-titulo');
    expect(ids(summary({ champion: true }, 5), { careerTitles: 2 })).not.toContain('primeiro-titulo');
    expect(ids(summary(), { careerRep: 80 })).toContain('tecnico-respeitado');
    expect(ids(summary(), { careerRep: 79 })).not.toContain('tecnico-respeitado');
    expect(ids(summary(), { daily: true })).toContain('desafio-do-dia');
    expect(ids(summary({ champion: true }, 5), { daily: true })).toContain('desafio-campeao');
    expect(ids(summary(), { previousCups: 0 })).toContain('primeira-copa');
    expect(ids(summary(), { previousCups: 3 })).not.toContain('primeira-copa');
  });

  it('não repete conquistas já desbloqueadas', () => {
    expect(ids(summary({ comeback: true }), {}, ['virada'])).not.toContain('virada');
  });
});

describe('ranking local', () => {
  const entry = (points: number, date = '2026-10-01') => rankingEntry({ ...summary(), total: points }, 'ready', 'Brasil', date);

  it('mantém as melhores campanhas em ordem e no máximo 20', () => {
    let list: ReturnType<typeof entry>[] = [];
    for (let i = 0; i < 30; i++) list = addToRanking(list, entry((i * 37) % 101));
    expect(list).toHaveLength(RANKING_SIZE);
    for (let i = 1; i < list.length; i++) expect(list[i]!.points).toBeLessThanOrEqual(list[i - 1]!.points);
    expect(list[0]!.points).toBe(Math.max(...Array.from({ length: 30 }, (_, i) => (i * 37) % 101)));
  });

  it('resume a campanha com modo, seleção e campanha', () => {
    const e = rankingEntry(summary({}, 3), 'career', 'Romênia', '2026-10-04');
    expect(e).toMatchObject({ mode: 'career', team: 'Romênia', date: '2026-10-04', w: 2, l: 1 });
  });
});
