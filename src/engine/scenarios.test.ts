import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { squadOf } from '../data/squads';
import { createScenario, SCENARIOS, scenarioResult, SCENARIO_POINTS } from './scenarios';
import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import { playRound, userFixture, nationOf } from './tournament';
import { simulateMatch } from './match';
import { buildSetup, fixtureSeed } from './tournament';
import type { World } from './types';

const world = worldJson as unknown as World;

function play(sc: (typeof SCENARIOS)[number]) {
  const nation = nationOf(world, sc.user);
  const squad = autoSquad23(squadOf(nation));
  const t = createScenario(world, sc, squad.map((p) => p.id), autoLineup(nation.id, squad, tacticsForStyle(nation.playStyle)));
  const f = userFixture(t, world)!;
  const report = simulateMatch([buildSetup(world, t, f.home, true), buildSetup(world, t, f.away, false)], { seed: fixtureSeed(t, f), knockout: true, detail: 'summary' });
  return { t, report, f };
}

describe('cenários', () => {
  it('todos citam seleções-era que existem, em épocas ou países diferentes', () => {
    const ids = new Set(world.nations.map((n) => n.id));
    for (const s of SCENARIOS) {
      expect(ids.has(s.user), s.id).toBe(true);
      expect(ids.has(s.opponent), s.id).toBe(true);
      expect(s.user).not.toBe(s.opponent);
    }
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  it('é uma partida só: a final entre o usuário e o adversário, e depois acaba', () => {
    const sc = SCENARIOS[0]!;
    const { t, report } = play(sc);
    expect(t.stage).toBe('F');
    const out = playRound(world, t, report).tournament;
    expect(out.stage).toBe('DONE');
    expect(out.results).toHaveLength(1);
    expect([sc.user, sc.opponent]).toContain(out.champion);
  });

  it('a escalação automática perde por pouco em todos: o jogador precisa fazer algo', () => {
    for (const sc of SCENARIOS) {
      const { t, report, f } = play(sc);
      const mine = f.home === t.userNationId ? 0 : 1;
      expect(report.score[mine], sc.id).toBeLessThan(report.score[1 - mine]!);
    }
  });

  it('mesma partida para todos com o mesmo elenco (seed fixa)', () => {
    const a = play(SCENARIOS[1]!).report;
    const b = play(SCENARIOS[1]!).report;
    expect(a.score).toEqual(b.score);
  });

  it('pontos: derrota vale pouco; vitória de azarão vale mais que de favorito', () => {
    const points = (id: string) => {
      const sc = SCENARIOS.find((s) => s.id === id)!;
      // procura um desfecho vencedor variando o elenco não é necessário: usa os resultados sintéticos abaixo
      const { t } = play(sc);
      return t;
    };
    const t = points('davi-golias');
    const win = (score: [number, number]) => ({ ...t, results: [{ id: 'SCN', stage: 'F' as const, teams: [t.userNationId, t.scenario!.opponent] as [string, string], score, extraTime: false, goals: [] }] });
    const w = scenarioResult(world, win([2, 0]))!;
    expect(w.result).toBe('W');
    expect(w.underdog).toBeGreaterThan(0);
    expect(w.points).toBe(SCENARIO_POINTS.win + 2 * SCENARIO_POINTS.perGoalMargin + w.underdog);
    const l = scenarioResult(world, win([1, 3]))!;
    expect(l.result).toBe('L');
    expect(l.points).toBeLessThanOrEqual(SCENARIO_POINTS.lossMax);
    expect(l.points).toBeLessThan(w.points);
  });
});
