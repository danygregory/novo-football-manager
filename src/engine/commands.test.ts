import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import { MatchSimulator, replayMatch, SHOUT_MINUTES, type TeamSetup } from './match';
import type { World } from './types';

const world = worldJson as unknown as World;
const get = (id: string) => world.nations.find((n) => n.id === id)!;
function setup(id: string, ai: boolean): TeamSetup {
  const n = get(id);
  const squad = autoSquad23(n.squad);
  return { nationId: id, name: n.country, squad, lineup: autoLineup(id, squad, tacticsForStyle(n.playStyle)), ai };
}
const mk = (seed: number) => new MatchSimulator([setup('BRA-1970', false), setup('GER-1980', true)], { seed });

describe('gritos táticos', () => {
  it('valem por 10 minutos, exigem 10 de recarga e não acumulam', () => {
    const sim = mk(3);
    sim.playThrough(20);
    expect(sim.execute({ kind: 'shout', side: 0, shout: 'press' })).toBe(true);
    const at = sim.clockExact;
    expect(sim.liveState().sides[0].shout?.kind).toBe('press');
    expect(sim.execute({ kind: 'shout', side: 0, shout: 'drop' })).toBe(false); // ativo
    sim.playThrough(at + SHOUT_MINUTES + 0.5);
    expect(sim.liveState().sides[0].shout).toBeUndefined();
    expect(sim.execute({ kind: 'shout', side: 0, shout: 'drop' })).toBe(false); // recarga
    sim.playThrough(at + 2 * SHOUT_MINUTES + 0.5);
    expect(sim.execute({ kind: 'shout', side: 0, shout: 'drop' })).toBe(true);
  });

  it('pressionar cansa mais o time; recuar cansa menos', () => {
    const avg = (shout?: 'press' | 'drop') => {
      let total = 0;
      for (let seed = 0; seed < 30; seed++) {
        const sim = mk(seed);
        sim.playThrough(10);
        if (shout) sim.execute({ kind: 'shout', side: 0, shout });
        sim.playThrough(21);
        total += sim.liveState().sides[0].onPitch.reduce((s, p) => s + p.cond, 0) / 11;
      }
      return total / 30;
    };
    expect(avg('press')).toBeLessThan(avg());
    expect(avg('drop')).toBeGreaterThan(avg('press'));
  });

  it('"bola longa" gera mais lances de ligação direta (mais impedimentos) que "toque curto"', () => {
    const offsides = (shout: 'long' | 'short') => {
      let t = 0;
      for (let seed = 0; seed < 150; seed++) {
        const sim = mk(seed);
        sim.playThrough(10);
        sim.execute({ kind: 'shout', side: 0, shout });
        sim.playThrough(20.5);
        t += sim.report().stats[0].offsides;
      }
      return t;
    };
    expect(offsides('long')).toBeGreaterThan(offsides('short'));
  });
});

describe('intervalo e conversa de vestiário', () => {
  it('o jogo para no intervalo e só então a conversa vale, uma vez por time', () => {
    const sim = mk(5);
    expect(sim.execute({ kind: 'talk', side: 0, tone: 'motivate' })).toBe(false); // antes do intervalo
    sim.playUntil(80);
    expect(sim.clockExact).toBeGreaterThanOrEqual(45);
    expect(sim.clockExact).toBeLessThan(46.5);
    expect(sim.eventLog.some((e) => e.type === 'halftime')).toBe(true);
    expect(sim.execute({ kind: 'talk', side: 0, tone: 'demand' })).toBe(true);
    expect(sim.execute({ kind: 'talk', side: 0, tone: 'calm' })).toBe(false);
    expect(sim.liveState().sides[0].talked).toBe(true);
    expect(sim.liveState().sides[0].morale).not.toBe(0);
    sim.playThrough(60);
    expect(sim.execute({ kind: 'talk', side: 0, tone: 'calm' })).toBe(false); // já passou o intervalo
  });

  it('conversas têm risco: o mesmo tom dá resultados diferentes conforme a partida', () => {
    const morales = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const sim = mk(seed);
      sim.playUntil(80);
      sim.execute({ kind: 'talk', side: 0, tone: 'demand' });
      morales.add(sim.liveState().sides[0].morale);
    }
    expect(morales.size).toBeGreaterThan(1);
    expect([...morales].some((m) => m > 0)).toBe(true);
    expect([...morales].some((m) => m < 0)).toBe(true);
  });

  it('liveState traz estatísticas, notas e a barra de momento', () => {
    const sim = mk(8);
    sim.playUntil(80);
    const st = sim.liveState();
    expect(st.stats[0].shots + st.stats[1].shots).toBeGreaterThan(3);
    expect(Object.keys(st.ratings).length).toBeGreaterThanOrEqual(22);
    expect(st.momentum).toBeGreaterThan(0);
    expect(st.momentum).toBeLessThan(1);
  });
});

describe('replay com gritos e conversa', () => {
  it('seed + comandos reproduzem a partida idêntica (incluindo o intervalo)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const opts = { seed, knockout: true, detail: 'full' as const };
      const live = new MatchSimulator([setup('BRA-1970', false), setup('GER-1980', true)], opts);
      live.playUntil(12.3);
      live.execute({ kind: 'shout', side: 0, shout: 'press' });
      live.playUntil(80); // para no intervalo
      live.execute({ kind: 'talk', side: 0, tone: 'demand' });
      live.execute({ kind: 'tactics', side: 0, tactics: { formation: '4-3-3', pressing: 0.8, lineHeight: 0.7, tempo: 0.7 } });
      live.playThrough(61.4);
      live.execute({ kind: 'shout', side: 0, shout: 'long' });
      const original = live.playToEnd();
      const again = replayMatch([setup('BRA-1970', false), setup('GER-1980', true)], opts, live.commands);
      expect(again).toEqual(original);
    }
  });
});
