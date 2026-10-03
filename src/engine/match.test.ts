import { describe, expect, it } from 'vitest';
import world from '../../data/world.json';
import { autoLineup, autoSquad23, validateLineup } from './lineup';
import { MatchSimulator, simulateMatch, type TeamSetup } from './match';
import type { NationEra } from './types';

const nations = world.nations as unknown as NationEra[];
const get = (id: string) => nations.find((n) => n.id === id) as NationEra;

function setup(id: string, ai = true): TeamSetup {
  const n = get(id);
  const squad = autoSquad23(n.squad);
  return { nationId: n.id, name: n.country, squad, lineup: autoLineup(n.id, squad), ai };
}

const A = () => setup('BRA-1970');
const B = () => setup('GER-1980');

describe('escalação automática', () => {
  it('gera convocação de 23 e escalação válida em todas as formações', () => {
    for (const n of nations) {
      const squad = autoSquad23(n.squad);
      expect(squad).toHaveLength(23);
      expect(squad.filter((p) => p.position === 'GK').length).toBeGreaterThanOrEqual(3);
      for (const formation of ['4-4-2', '4-3-3', '3-5-2', '5-4-1'] as const) {
        const lineup = autoLineup(n.id, squad, { formation, pressing: 0.5, lineHeight: 0.5, tempo: 0.5 });
        expect(validateLineup(lineup, squad)).toEqual([]);
        expect(lineup.bench.length).toBe(12);
      }
    }
  });
});

describe('determinismo', () => {
  it('mesma seed e mesmas escalações geram a mesma partida', () => {
    const r1 = simulateMatch([A(), B()], { seed: 123 });
    const r2 = simulateMatch([A(), B()], { seed: 123 });
    expect(r2).toEqual(r1);
  });

  it('seeds diferentes geram partidas diferentes', () => {
    const scores = new Set<string>();
    for (let s = 0; s < 40; s++) scores.add(simulateMatch([A(), B()], { seed: s, detail: 'summary' }).score.join('-'));
    expect(scores.size).toBeGreaterThan(3);
  });

  it('o nível de detalhe não altera o resultado', () => {
    for (let s = 0; s < 30; s++) {
      const full = simulateMatch([A(), B()], { seed: s, detail: 'full', knockout: true });
      const sum = simulateMatch([A(), B()], { seed: s, detail: 'summary', knockout: true });
      expect(sum.score).toEqual(full.score);
      expect(sum.shootout).toEqual(full.shootout);
      expect(sum.stats).toEqual(full.stats);
      expect(sum.ratings).toEqual(full.ratings);
    }
  });

  it('simular em pedaços dá o mesmo resultado que de uma vez', () => {
    const whole = simulateMatch([A(), B()], { seed: 77 });
    const sim = new MatchSimulator([A(), B()], { seed: 77 });
    for (let m = 10; m <= 90; m += 10) sim.playUntil(m);
    expect(sim.playToEnd()).toEqual(whole);
  });

  it('o motor não usa Math.random', () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random proibido no motor');
    };
    try {
      simulateMatch([A(), B()], { seed: 5, knockout: true });
    } finally {
      Math.random = original;
    }
  });
});

describe('integridade do relatório', () => {
  it('placar bate com os eventos de gol e estatísticas fazem sentido', () => {
    for (let s = 0; s < 60; s++) {
      const r = simulateMatch([A(), B()], { seed: s });
      const goals: [number, number] = [0, 0];
      for (const e of r.events) if (e.type === 'goal') goals[e.team]++;
      expect(goals).toEqual(r.score);
      expect(r.stats[0].possession + r.stats[1].possession).toBeCloseTo(100, 0);
      for (const st of r.stats) {
        expect(st.shotsOnTarget).toBeLessThanOrEqual(st.shots);
        expect(st.xg).toBeGreaterThanOrEqual(0);
      }
      for (const v of Object.values(r.ratings)) {
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(10);
      }
      const minutes = r.events.map((e) => e.minute);
      expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
      expect(r.events[0]?.type).toBe('kickoff');
      expect(r.events[r.events.length - 1]?.type).toBe('fulltime');
    }
  });

  it('só o mata-mata empatado tem prorrogação e pênaltis, e há sempre vencedor', () => {
    let shootouts = 0;
    for (let s = 0; s < 200; s++) {
      const r = simulateMatch([A(), A()], { seed: s, knockout: true, detail: 'summary' });
      if (r.shootout) {
        shootouts++;
        expect(r.score[0]).toBe(r.score[1]);
        expect(r.shootout[0]).not.toBe(r.shootout[1]);
        expect(r.extraTime).toBe(true);
      } else if (r.extraTime) {
        expect(r.score[0]).not.toBe(r.score[1]);
      }
    }
    expect(shootouts).toBeGreaterThan(0);
    const league = simulateMatch([A(), A()], { seed: 1, knockout: false });
    expect(league.shootout).toBeUndefined();
    expect(league.minutes).toBe(90);
  });
});

describe('tática, fadiga e substituições', () => {
  it('permite até 5 substituições e valida os jogadores', () => {
    const sim = new MatchSimulator([setup('BRA-1970', false), B()], { seed: 9 });
    sim.playUntil(30);
    const field = sim.onPitch(0).filter((p) => p.position !== 'GK');
    const bench = sim.benchPlayers(0);
    expect(sim.substitute(0, field[0]!.id, bench[0]!.id)).toBe(true);
    expect(sim.substitute(0, field[0]!.id, bench[1]!.id)).toBe(false); // já saiu
    expect(sim.substitute(0, field[1]!.id, bench[0]!.id)).toBe(false); // já entrou
    for (let i = 1; i < 5; i++) expect(sim.substitute(0, field[i]!.id, bench[i]!.id)).toBe(true);
    expect(sim.subsLeft(0)).toBe(0);
    expect(sim.substitute(0, field[5]!.id, bench[5]!.id)).toBe(false);
  });

  it('jogadores cansam durante a partida e o relatório traz a condição final', () => {
    const r = simulateMatch([A(), B()], { seed: 3 });
    const id = r.starters[0][5] as string;
    const start = get('BRA-1970').squad.find((p) => p.id === id)!.condition;
    expect(r.finalCondition[id]).toBeLessThan(start);
  });

  it('pressão alta cansa mais', () => {
    const run = (pressing: number) => {
      const s = setup('BRA-1970');
      s.lineup.tactics = { ...s.lineup.tactics, pressing };
      const r = simulateMatch([s, B()], { seed: 4, detail: 'summary' });
      const ids = r.starters[0];
      return ids.reduce((acc, id) => acc + (r.finalCondition[id] as number), 0) / 11;
    };
    expect(run(1)).toBeLessThan(run(0));
  });

  it('setTactics durante o jogo troca a formação sem quebrar', () => {
    const sim = new MatchSimulator([setup('BRA-1970', false), B()], { seed: 11 });
    sim.playUntil(20);
    sim.setTactics(0, { formation: '5-4-1', pressing: 0.3, lineHeight: 0.2, tempo: 0.4 });
    const r = sim.playToEnd();
    expect(r.events.some((e) => e.type === 'tactic')).toBe(true);
  });

  it('o mais forte vence mais vezes, mas há zebras', () => {
    const strong = setup('ARG-2020');
    const weak = setup('CHN-1950');
    let wins = 0, losses = 0;
    const n = 400;
    for (let s = 0; s < n; s++) {
      const r = simulateMatch([strong, weak], { seed: s, detail: 'summary' });
      if (r.score[0] > r.score[1]) wins++;
      else if (r.score[0] < r.score[1]) losses++;
    }
    expect(wins).toBeGreaterThan(losses * 3);
  });

  it('simula uma partida em poucos milissegundos', () => {
    const t0 = performance.now();
    for (let s = 0; s < 200; s++) simulateMatch([A(), B()], { seed: s, detail: 'summary' });
    expect((performance.now() - t0) / 200).toBeLessThan(5);
  });
});
