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
import { squadOf } from '../data/squads';

const world = worldJson as unknown as World;

function newCup(nationId = 'BRA-1970', seed = 7): Tournament {
  const nation = world.nations.find((n) => n.id === nationId)!;
  const squad = autoSquad23(squadOf(nation));
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

import { finalizeDraft, greedyDraft } from '../data/draft';
import { cutSizes, drawOpponents, withCustom } from './tournament';

describe('recorte da Copa e potes', () => {
  const user = 'BRA-1970';
  const mk = (cut: 'all' | 1930 | 1970 | 2010 | 2020, seed = 5) => {
    const nation = world.nations.find((n) => n.id === user)!;
    const squad = autoSquad23(squadOf(nation));
    return createTournament(world, user, squad.map((p) => p.id), autoLineup(user, squad, tacticsForStyle(nation.playStyle)), seed, { cut });
  };

  it('uma década específica sorteia os 31 adversários só dela; "todas as eras" mistura décadas', () => {
    const t70 = mk(1970);
    expect(t70.participants).toHaveLength(32);
    expect(t70.participants[0]).toBe(user);
    for (const id of t70.participants) expect(world.nations.find((n) => n.id === id)?.decade).toBe(1970);
    const decades = new Set(mk('all').participants.map((id) => world.nations.find((n) => n.id === id)?.decade));
    expect(decades.size).toBeGreaterThan(4);
    expect(new Set(t70.participants).size).toBe(32);
  });

  it('no máximo uma seleção-era por país na mesma Copa (décadas e gerações do mesmo país não jogam juntas)', () => {
    for (const cut of ['all', 1970, 2010] as const) {
      for (let seed = 0; seed < 15; seed++) {
        const codes = mk(cut, seed).participants.map((id) => world.nations.find((n) => n.id === id)!.code);
        expect(new Set(codes).size).toBe(32);
      }
    }
  });

  it('o sorteio é determinístico por seed e muda com a seed', () => {
    expect(mk('all', 1).participants).toEqual(mk('all', 1).participants);
    expect(mk('all', 1).participants).not.toEqual(mk('all', 2).participants);
    expect(drawOpponents(world, user, 9, 2020)).toEqual(drawOpponents(world, user, 9, 2020));
  });

  it('as 32 seleções são distribuídas em 4 potes por força: cada grupo recebe uma de cada pote', () => {
    for (const cut of ['all', 1970, 1930] as const) {
      const t = mk(cut, 11);
      const rank = new Map(
        [...t.participants].map((id) => world.nations.find((n) => n.id === id)!).sort((a, b) => b.elo - a.elo || a.id.localeCompare(b.id)).map((n, i) => [n.id, Math.floor(i / 8)] as const),
      );
      for (const g of t.groups) expect(new Set(g.map((id) => rank.get(id))).size).toBe(4);
    }
  });

  it('só oferece recortes com seleções suficientes e falha com um recorte pequeno demais', () => {
    const sizes = cutSizes(world);
    expect(sizes.get('all')).toBe(new Set(world.nations.map((n) => n.code)).size);
    for (const [k, n] of sizes) if (k !== 'all') expect(n).toBeGreaterThanOrEqual(32);
    const tiny: typeof world = { ...world, nations: world.nations.filter((n) => n.decade === 1970).slice(0, 20) };
    expect(() => drawOpponents(tiny, 'X-1', 1, 'all')).toThrow();
  });
});

describe('Copa com um time montado no draft', () => {
  it('joga a Copa inteira (63 jogos), o time aparece nos grupos e há campeão e prêmios', () => {
    const state = greedyDraft(world, { seed: 77, name: 'Time dos Amigos', colors: ['#112233', '#ffcc00'], formation: '4-3-3', memory: false });
    const team = finalizeDraft(state);
    const w = withCustom(world, team);
    const squad = team.customSquad!;
    let t = createTournament(world, team.id, squad.map((p) => p.id), autoLineup(team.id, squad, tacticsForStyle(team.playStyle)), 31, { cut: 'all', custom: team });
    expect(t.groups.flat()).toContain(team.id);
    while (t.stage !== 'DONE') {
      const mine = userFixture(t, w);
      if (!mine) {
        t = playRemaining(w, t);
        break;
      }
      const report = simulateMatch([buildSetup(w, t, mine.home, mine.home === team.id), buildSetup(w, t, mine.away, mine.away === team.id)], {
        seed: fixtureSeed(t, mine),
        knockout: !t.stage.startsWith('G'),
        detail: 'summary',
      });
      t = playRound(w, t, report).tournament;
    }
    expect(t.results).toHaveLength(63);
    expect(t.champion).toBeTruthy();
    expect(awards(t).bestPlayer).toBeDefined();
    expect(t.custom?.country).toBe('Time dos Amigos');
  });
});
