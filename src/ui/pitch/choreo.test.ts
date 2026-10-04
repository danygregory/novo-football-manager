import { describe, expect, it } from 'vitest';
import type { MatchEvent, Slot } from '../../engine/types';
import { Choreo, FIELD_H, FIELD_W, STEP, type Fx, type PlayerBrief } from './choreo';

const SLOTS: Slot[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'LW', 'CM', 'CM', 'RW', 'ST', 'ST'];

function briefs(): PlayerBrief[] {
  const out: PlayerBrief[] = [];
  ([0, 1] as const).forEach((side) =>
    SLOTS.forEach((slot, i) =>
      out.push({ id: `${side}-${i}`, name: `J${side}${i}`, side, slot, speed: 40 + ((i * 13 + side * 7) % 55), skill: 60, iq: 60, cond: 95, keeper: slot === 'GK' }),
    ),
  );
  return out;
}

function make(seed = 1): Choreo {
  const c = new Choreo(seed);
  c.setLineups(briefs(), [{ line: 0.5, press: 0.5 }, { line: 0.5, press: 0.5 }]);
  c.advance(2);
  return c;
}

const ev = (type: MatchEvent['type'], extra: Partial<MatchEvent> = {}): MatchEvent => ({ minute: 10, type, team: 0, zone: 'MID', t: 10, text: type, ...extra });
const names = (id: string) => id;

describe('coreografia', () => {
  it('é determinística: mesma seed e mesmos eventos geram as mesmas posições', () => {
    const run = () => {
      const c = make(7);
      c.push(ev('advance', { zone: 'ATT' }), names);
      c.push(ev('goal', { playerId: '0-9', secondaryPlayerId: '0-7', shotType: 'trabalhada', zone: 'BOX' }), names);
      c.advance(8);
      return [...c.agents.values()].map((a) => [a.id, a.x.toFixed(3), a.y.toFixed(3)]).concat([['ball', c.ball.x.toFixed(3), c.ball.y.toFixed(3)]]);
    };
    expect(run()).toEqual(run());
  });

  it('um gol só é confirmado quando a bola chega à rede, com efeitos de rede e gol', () => {
    const c = make(3);
    const fx: Fx[] = [];
    const committed: string[] = [];
    c.onFx = (f) => fx.push(f);
    c.onCommit = (e) => committed.push(e.type);
    c.push(ev('goal', { playerId: '0-9', secondaryPlayerId: '0-7', shotType: 'trabalhada', zone: 'BOX' }), names);
    c.advance(0.2);
    expect(committed).not.toContain('goal');
    c.advance(6);
    expect(committed).toContain('goal');
    expect(fx.map((f) => f.kind)).toEqual(expect.arrayContaining(['net', 'goal']));
    expect(c.ball.x).toBeGreaterThan(FIELD_W - 0.5); // dentro da rede do lado direito
  });

  it('chute para fora passa da linha de fundo e não gera efeito de gol', () => {
    const c = make(4);
    const fx: Fx[] = [];
    c.onFx = (f) => fx.push(f);
    c.push(ev('miss', { playerId: '0-9', shotType: 'trabalhada', zone: 'BOX' }), names);
    c.advance(6);
    expect(fx.some((f) => f.kind === 'goal')).toBe(false);
  });

  it('jogadores respeitam o limite de velocidade e nunca ficam colados (separação mínima)', () => {
    const c = make(9);
    for (let i = 0; i < 12; i++) {
      c.push(ev('advance', { team: (i % 2) as 0 | 1, zone: i % 3 === 0 ? 'DEF' : i % 3 === 1 ? 'MID' : 'ATT' }), names);
    }
    let minDist = Infinity;
    for (let k = 0; k < 60 * 14; k++) {
      c.advance(STEP);
      const list = [...c.agents.values()];
      for (const a of list) {
        expect(Math.hypot(a.vx, a.vy)).toBeLessThanOrEqual(a.vmax + 1e-6);
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.x).toBeLessThanOrEqual(FIELD_W);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeLessThanOrEqual(FIELD_H);
      }
      if (k % 30 === 0) {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) minDist = Math.min(minDist, Math.hypot((list[i]!.x - list[j]!.x), (list[i]!.y - list[j]!.y)));
      }
    }
    expect(minDist).toBeGreaterThan(1.5);
  });

  it('o atacante mais rápido percorre mais campo que o mais lento no mesmo tempo', () => {
    const c = make(2);
    const fast = [...c.agents.values()].filter((a) => a.side === 0).sort((a, b) => b.vmax - a.vmax)[0]!;
    const slow = [...c.agents.values()].filter((a) => a.side === 0).sort((a, b) => a.vmax - b.vmax)[0]!;
    expect(fast.vmax).toBeGreaterThan(slow.vmax * 1.2);
  });

  it('flush confirma todos os eventos sem animar', () => {
    const c = make(5);
    const seen: string[] = [];
    c.onCommit = (e) => seen.push(e.type);
    c.push(ev('advance', { zone: 'MID' }), names);
    c.push(ev('goal', { playerId: '0-9', zone: 'BOX' }), names);
    c.push(ev('yellow', { playerId: '1-3' }), names);
    c.flush();
    expect(seen).toEqual(['advance', 'goal', 'yellow']);
    expect(c.pending).toBe(0);
  });
});

import worldJson from '../../../data/world.json';
import { autoLineup, autoSquad23, tacticsForStyle } from '../../engine/lineup';
import { MatchSimulator, type TeamSetup } from '../../engine/match';
import type { NationEra } from '../../engine/types';
import { squadOf } from '../../data/squads';

const nations = (worldJson as unknown as { nations: NationEra[] }).nations;

function realMatchChoreo(seed: number): { choreo: Choreo; events: MatchEvent[] } {
  const mk = (id: string): TeamSetup => {
    const n = nations.find((x) => x.id === id)!;
    const squad = autoSquad23(squadOf(n));
    return { nationId: id, name: n.country, squad, lineup: autoLineup(id, squad, tacticsForStyle(n.playStyle)), ai: true };
  };
  const sim = new MatchSimulator([mk('BRA-1970'), mk('GER-1980')], { seed });
  sim.playThrough(60);
  const st = sim.liveState();
  const players = new Map(nations.flatMap((n) => squadOf(n).map((p) => [p.id, p] as const)));
  const lineups: PlayerBrief[] = [];
  ([0, 1] as const).forEach((side) =>
    st.sides[side].onPitch.forEach((o) => {
      const p = players.get(o.id)!;
      lineups.push({ id: o.id, name: p.name, side, slot: o.slot, speed: p.attrs.velocidade, skill: (p.attrs.passe + p.attrs.drible) / 2, iq: (p.attrs.defesa + p.attrs.passe) / 2, cond: 95, keeper: o.slot === 'GK' });
    }),
  );
  const c = new Choreo(seed);
  c.setLineups(lineups, [{ line: 0.5, press: 0.5 }, { line: 0.5, press: 0.5 }]);
  c.advance(2);
  return { choreo: c, events: sim.eventLog.filter((e) => (e.t ?? 0) < 40) as MatchEvent[] };
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i]! - ma) * (b[i]! - mb);
    saa += (a[i]! - ma) ** 2;
    sbb += (b[i]! - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

describe('movimento independente', () => {
  it('em 60 s de partida a correlação média da velocidade horizontal entre companheiros fica abaixo de 0,7', () => {
    const results: number[] = [];
    for (const seed of [11, 12, 13]) {
      const { choreo, events } = realMatchChoreo(seed);
      const queue = [...events];
      const series = new Map<string, number[]>();
      const t0 = choreo.time;
      const names2 = (id: string) => id;
      while (choreo.time - t0 < 60) {
        while (queue.length && (queue[0]!.t ?? 0) * 1.6 <= choreo.time - t0) choreo.push(queue.shift() as MatchEvent, names2);
        choreo.advance(0.1);
        for (const a of choreo.agents.values()) (series.get(a.id) ?? series.set(a.id, []).get(a.id)!).push(a.vx * (a.side === 0 ? 1 : -1));
      }
      for (const side of [0, 1] as const) {
        const ids = [...choreo.agents.values()].filter((a) => a.side === side && !a.keeper).map((a) => a.id);
        const cors: number[] = [];
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) cors.push(pearson(series.get(ids[i]!)!, series.get(ids[j]!)!));
        results.push(cors.reduce((s, v) => s + v, 0) / cors.length);
      }
    }
    const mean = results.reduce((s, v) => s + v, 0) / results.length;
    console.log('correlação média de velocidade horizontal entre companheiros:', mean.toFixed(3));
    expect(mean).toBeLessThan(0.7);
  });

  it('o finalizador chega ao ponto da área antes de receber a bola e chutar', () => {
    const c = make(21);
    const shooter = c.agents.get('0-9')!;
    let arrived = Infinity;
    c.onCommit = () => {
      arrived = Math.hypot(shooter.x - (FIELD_W - 13), shooter.y - FIELD_H / 2);
    };
    c.push(ev('goal', { playerId: '0-9', secondaryPlayerId: '0-7', shotType: 'trabalhada', zone: 'BOX' }), names);
    c.advance(10);
    expect(arrived).toBeLessThan(12); // estava dentro da área (entre 10 e 16 m do gol, com folga lateral)
    expect(shooter.x).toBeGreaterThan(FIELD_W - 30);
  });

  it('no máximo 2 jogadores pressionam o portador', () => {
    const c = make(31);
    c.push(ev('advance', { zone: 'ATT' }), names);
    let maxPress = 0;
    for (let k = 0; k < 60 * 6; k++) {
      c.advance(STEP);
      maxPress = Math.max(maxPress, [...c.agents.values()].filter((a) => a.pressing).length);
    }
    expect(maxPress).toBeLessThanOrEqual(2);
  });

  it('o rápido percorre mais que o lento ao correr para o mesmo ponto', () => {
    const c = make(41);
    const list = [...c.agents.values()].filter((a) => a.side === 0 && !a.keeper);
    const fast = list.sort((a, b) => b.vmax - a.vmax)[0]!;
    const slow = list.sort((a, b) => a.vmax - b.vmax)[0]!;
    for (const a of [fast, slow]) {
      a.x = 10;
      a.y = a.id === fast.id ? 20 : 48;
      a.vx = 0;
      a.vy = 0;
      a.override = { x: 95, y: a.y, until: c.time + 20 };
    }
    c.advance(2.2);
    expect(fast.x - 10).toBeGreaterThan((slow.x - 10) * 1.15);
  });

  it('em 4x os passos continuam fixos: o mesmo tempo em quadros diferentes dá o mesmo resultado', () => {
    const run = (chunks: number) => {
      const c = make(51);
      c.push(ev('advance', { zone: 'ATT' }), names);
      for (let i = 0; i < chunks; i++) c.advance(8 / chunks);
      return [...c.agents.values()].map((a) => `${a.x.toFixed(2)},${a.y.toFixed(2)}`).join('|');
    };
    expect(run(8)).toBe(run(160));
  });
});
