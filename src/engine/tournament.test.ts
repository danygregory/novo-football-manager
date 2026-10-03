import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import { simulateMatch } from './match';
import {
  awards,
  buildSetup,
  createTournament,
  currentFixtures,
  fixtureSeed,
  playRemaining,
  playRound,
  standings,
  userFixture,
  userStatus,
  winnerOf,
  type Tournament,
} from './tournament';
import type { World } from './types';

const world = worldJson as unknown as World;

function newCup(nationId = 'BRA-1970', seed = 7): Tournament {
  const nation = world.nations.find((n) => n.id === nationId)!;
  const squad = autoSquad23(nation.squad);
  const lineup = autoLineup(nationId, squad, tacticsForStyle(nation.playStyle));
  return createTournament(world, nationId, squad.map((p) => p.id), lineup, seed);
}

/** Joga a Copa inteira com o usuário simulado instantaneamente (como a tela de partida instantânea fará). */
function playAll(t: Tournament): Tournament {
  while (t.stage !== 'DONE') {
    const mine = userFixture(t, world);
    if (!mine) return playRemaining(world, t);
    const report = simulateMatch([buildSetup(world, t, mine.home, mine.home === t.userNationId), buildSetup(world, t, mine.away, mine.away === t.userNationId)], {
      seed: fixtureSeed(t, mine),
      knockout: !t.stage.startsWith('G'),
      detail: 'summary',
    });
    t = playRound(world, t, report).tournament;
  }
  return t;
}

describe('sorteio', () => {
  it('forma 8 grupos de 4 com as 32 seleções, uma de cada pote, e é determinístico', () => {
    const t = newCup();
    expect(t.groups).toHaveLength(8);
    expect(t.groups.every((g) => g.length === 4)).toBe(true);
    expect(new Set(t.groups.flat()).size).toBe(32);
    expect(t.groups.flat()).toContain('BRA-1970');
    expect(newCup().groups).toEqual(t.groups);
    expect(newCup('BRA-1970', 8).groups).not.toEqual(t.groups);
  });

  it('cada seleção joga uma vez por rodada de grupos', () => {
    const t = newCup();
    const fx = currentFixtures(t, world);
    expect(fx).toHaveLength(16);
    expect(new Set(fx.flatMap((f) => [f.home, f.away])).size).toBe(32);
  });
});

describe('Copa completa', () => {
  const t = playAll(newCup());

  it('tem 63 jogos, campeão e etapas na ordem', () => {
    expect(t.results).toHaveLength(63);
    expect(t.stage).toBe('DONE');
    expect(t.champion).toBeTruthy();
    expect(t.results.filter((r) => r.stage === 'R16')).toHaveLength(8);
    expect(t.results.filter((r) => r.stage === 'F')).toHaveLength(1);
    expect(t.champion).toBe(winnerOf(t.results.find((r) => r.stage === 'F')!));
  });

  it('cada grupo fecha com 6 jogos por time somando 3 e o mata-mata não tem empate sem pênaltis', () => {
    for (let g = 0; g < 8; g++) {
      const table = standings(t, g, world);
      expect(table.every((s) => s.played === 3)).toBe(true);
      expect(table.reduce((a, s) => a + s.gf, 0)).toBe(table.reduce((a, s) => a + s.ga, 0));
    }
    for (const r of t.results.filter((x) => !x.stage.startsWith('G'))) {
      if (r.score[0] === r.score[1]) expect(r.shootout).toBeDefined();
    }
  });

  it('classificados das oitavas são os 2 primeiros de cada grupo', () => {
    const r16 = t.results.filter((r) => r.stage === 'R16').flatMap((r) => r.teams);
    const expected = t.groups.flatMap((_, g) => standings(t, g, world).slice(0, 2).map((s) => s.id));
    expect([...r16].sort()).toEqual([...expected].sort());
  });

  it('é determinístico e gera prêmios', () => {
    expect(playAll(newCup())).toEqual(t);
    const a = awards(t);
    expect(a.topScorer?.goals).toBeGreaterThan(0);
    expect(a.bestPlayer?.apps).toBeGreaterThan(0);
  });

  it('condição fica entre 0 e 100', () => {
    for (const c of Object.values(t.cond)) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(100);
    }
  });
});

describe('rodada', () => {
  it('exige a partida do usuário enquanto ele está na Copa', () => {
    expect(() => playRound(world, newCup())).toThrow();
    expect(userStatus(newCup(), world)).toBe('alive');
  });

  it('o cansaço acumulado reduz a condição entre os jogos', () => {
    let t = newCup();
    const mine = userFixture(t, world)!;
    const report = simulateMatch([buildSetup(world, t, mine.home, mine.home === t.userNationId), buildSetup(world, t, mine.away, mine.away === t.userNationId)], {
      seed: fixtureSeed(t, mine),
      detail: 'summary',
    });
    const before = t.cond[t.userLineup.starters[5] as string] as number;
    t = playRound(world, t, report).tournament;
    const after = t.cond[t.userLineup.starters[5] as string] as number;
    expect(after).toBeLessThan(before + 5);
  });
});
