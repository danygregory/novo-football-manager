import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { squadOf } from '../data/squads';
import {
  REP,
  START_REPUTATION,
  applyCup,
  careerCut,
  careerStartOptions,
  clampRep,
  evaluateCup,
  makeOffers,
  newCareer,
  offerCount,
  reputationDelta,
  summarizeCareer,
  takeTeam,
  worldPercentile,
  worldPot,
  type Career,
  type CupEvaluation,
} from './career';
import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import { simulateMatch } from './match';
import { buildSetup, createTournament, fixtureSeed, playRemaining, playRound, userFixture, type Tournament } from './tournament';
import type { World } from './types';

const world = worldJson as unknown as World;

function playCup(nationId: string, seed: number, cut: 'all' | number = 'all'): Tournament {
  const n = world.nations.find((x) => x.id === nationId)!;
  const squad = autoSquad23(squadOf(n));
  let t = createTournament(world, nationId, squad.map((p) => p.id), autoLineup(nationId, squad, tacticsForStyle(n.playStyle)), seed, { cut: cut as 'all' });
  while (t.stage !== 'DONE') {
    const mine = userFixture(t, world);
    if (!mine) return playRemaining(world, t);
    const report = simulateMatch([buildSetup(world, t, mine.home, false), buildSetup(world, t, mine.away, false)], { seed: fixtureSeed(t, mine), knockout: !t.stage.startsWith('G'), detail: 'summary' });
    t = playRound(world, t, report).tournament;
  }
  return t;
}

const ev = (over: Partial<CupEvaluation>): CupEvaluation => ({ stage: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, perf: 0, expectedStage: 1.2, pot: 2, rank: 10, champion: false, ...over });

describe('carreira: início', () => {
  it('sorteia 3 seleções dos potes 3 e 4, de países diferentes, de forma determinística', () => {
    const a = careerStartOptions(world, 42);
    expect(a).toHaveLength(3);
    expect(careerStartOptions(world, 42)).toEqual(a);
    expect(careerStartOptions(world, 43)).not.toEqual(a);
    const nations = a.map((id) => world.nations.find((n) => n.id === id)!);
    expect(new Set(nations.map((n) => n.code)).size).toBe(3);
    for (const n of nations) expect(worldPot(world, n.elo)).toBeGreaterThanOrEqual(3);
  });

  it('os potes mundiais dividem as seleções-era em quartis de força', () => {
    const counts = [0, 0, 0, 0, 0];
    for (const n of world.nations) counts[worldPot(world, n.elo)]!++;
    for (const k of [1, 2, 3, 4]) expect(counts[k]! / world.nations.length).toBeGreaterThan(0.18);
    expect(worldPercentile(world, 9999)).toBe(100);
  });

  it('o recorte da Copa da carreira é a década da seleção (adversários da mesma época)', () => {
    expect(careerCut(world, world.nations.find((n) => n.id === 'BRA-1970')!)).toBe(1970);
  });
});

describe('carreira: reputação', () => {
  it('campeão com time fraco sobe muito mais que campeão com favorito; fracasso de favorito derruba', () => {
    const champWeak = reputationDelta(ev({ stage: 5, champion: true, expectedStage: 0.25, perf: 3 }));
    const champStrong = reputationDelta(ev({ stage: 5, champion: true, expectedStage: 3.6, perf: 1.2 }));
    expect(champWeak).toBeGreaterThan(champStrong);
    expect(champWeak).toBeGreaterThan(20);
    expect(reputationDelta(ev({ stage: 0, expectedStage: 3.6, perf: -1.5 }))).toBeLessThan(-10);
    expect(reputationDelta(ev({ stage: 1, expectedStage: 1.2, perf: 0 }))).toBeGreaterThanOrEqual(-2);
  });

  it('a variação e a reputação ficam sempre entre os limites', () => {
    expect(reputationDelta(ev({ stage: 5, champion: true, expectedStage: 0, perf: 20 }))).toBeLessThanOrEqual(30);
    expect(reputationDelta(ev({ stage: 0, expectedStage: 5, perf: -20 }))).toBeGreaterThanOrEqual(-18);
    expect(clampRep(-5)).toBe(0);
    expect(clampRep(140)).toBe(100);
  });

  it('avalia uma Copa real: resultados fecham com os jogos, etapa coerente, pote e posição válidos', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const t = playCup('BRA-1970', seed);
      const e = evaluateCup(world, t);
      const mine = t.results.filter((r) => r.teams.includes('BRA-1970'));
      expect(e.w + e.d + e.l).toBe(mine.length);
      expect(e.rank).toBeGreaterThanOrEqual(1);
      expect(e.rank).toBeLessThanOrEqual(32);
      expect([1, 2, 3, 4]).toContain(e.pot);
      expect(e.champion).toBe(t.champion === 'BRA-1970');
      if (e.champion) expect(e.stage).toBe(5);
      const last = mine[mine.length - 1]!;
      if (!e.champion && last.stage === 'F') expect(e.stage).toBe(4);
      if (last.stage.startsWith('G')) expect(e.stage).toBe(0);
    }
  });
});

describe('carreira: reputação (equilíbrio)', () => {
  it('o fracasso pesa menos que o acerto de mesmo tamanho, e disputar a Copa já rende uma presença', () => {
    const up = reputationDelta(ev({ stage: 2, expectedStage: 1.2, perf: 0 })); // +0,8 etapa
    const down = reputationDelta(ev({ stage: 1, expectedStage: 1.2 + 0.8 - 0.2 + 0, perf: 0 })); // -0,8 etapa
    expect(up).toBeGreaterThan(0);
    expect(Math.abs(Math.min(0, down - REP.participation))).toBeLessThan(up - REP.participation + 0.001);
    expect(reputationDelta(ev({ stage: 1, expectedStage: 1, perf: 0 }))).toBe(REP.participation);
  });

  it('o piso de uma campanha desastrosa não derruba a reputação de vez', () => {
    expect(reputationDelta(ev({ stage: 0, expectedStage: 5, perf: -10 }))).toBe(REP.min);
    expect(REP.min).toBeGreaterThanOrEqual(-14);
  });
});

describe('carreira: convites', () => {
  it('a quantidade depende do desempenho: de 0 a 3', () => {
    expect(offerCount(-10, false)).toBe(0);
    expect(offerCount(0, false)).toBe(1);
    expect(offerCount(6, false)).toBe(2);
    expect(offerCount(15, false)).toBe(3);
    expect(offerCount(-5, true)).toBe(3);
  });

  it('só convida seleções compatíveis com a reputação, de países diferentes do atual, de forma determinística', () => {
    for (const rep of [20, 50, 85]) {
      const offers = makeOffers(world, rep, 9, 3, 'BRA');
      expect(offers.length).toBeLessThanOrEqual(3);
      expect(makeOffers(world, rep, 9, 3, 'BRA')).toEqual(offers);
      const nations = offers.map((id) => world.nations.find((n) => n.id === id)!);
      expect(new Set(nations.map((n) => n.code)).size).toBe(nations.length);
      for (const n of nations) {
        expect(n.code).not.toBe('BRA');
        const p = worldPercentile(world, n.elo);
        expect(p).toBeGreaterThanOrEqual(rep - 25);
        expect(p).toBeLessThanOrEqual(rep + 18);
      }
    }
    expect(makeOffers(world, 50, 1, 0)).toEqual([]);
  });

  it('com reputação mais alta os convites são de seleções mais fortes', () => {
    const avg = (rep: number) => {
      const xs: number[] = [];
      for (let s = 0; s < 30; s++) for (const id of makeOffers(world, rep, s, 3)) xs.push(world.nations.find((n) => n.id === id)!.elo);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(avg(80)).toBeGreaterThan(avg(25) + 100);
  });
});

describe('carreira: histórico', () => {
  it('aplica Copas em sequência: reputação atualizada, histórico, convites e resumo (Copas, títulos, melhor campanha, seleções)', () => {
    let career: Career = newCareer(world, 7);
    expect(career.rep).toBe(START_REPUTATION);
    expect(career.startOptions).toHaveLength(3);
    career = takeTeam(career, career.startOptions![0]!);
    expect(career.startOptions).toBeUndefined();
    for (let i = 0; i < 4; i++) {
      const nation = world.nations.find((n) => n.id === career.nationId)!;
      const t = playCup(nation.id, 100 + i, careerCut(world, nation) as number);
      const e = evaluateCup(world, t);
      const before = career.rep;
      career = applyCup(world, career, t, e, 10);
      expect(career.entries).toHaveLength(i + 1);
      expect(career.rep).toBeGreaterThanOrEqual(0);
      expect(career.rep).toBeLessThanOrEqual(100);
      expect(career.entries[i]!.repBefore).toBe(before);
      expect(career.offers!.length).toBeLessThanOrEqual(3);
      // aceita o primeiro convite, se houver; senão continua
      career = career.offers!.length ? takeTeam(career, career.offers![0]!) : { ...career, offers: undefined };
    }
    const sum = summarizeCareer(career);
    expect(sum.cups).toBe(4);
    expect(sum.titles).toBe(career.entries.filter((e) => e.champion).length);
    expect(sum.best).toBeDefined();
    expect(sum.teams.reduce((a, t) => a + t.cups, 0)).toBe(4);
  });
});
