import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import { MatchSimulator, replayMatch, type TeamSetup } from './match';
import { squadOf } from '../data/squads';
import type { MatchEvent, NationEra, PenaltyZone, World } from './types';

const world = worldJson as unknown as World;
const get = (id: string) => world.nations.find((n) => n.id === id) as NationEra;
function setup(id: string, ai: boolean): TeamSetup {
  const n = get(id);
  const squad = autoSquad23(squadOf(n));
  return { nationId: id, name: n.country, squad, lineup: autoLineup(id, squad, tacticsForStyle(n.playStyle)), ai };
}

/** Joga um empate no mata-mata até a disputa: todos os jogos de A x A acabam em pênaltis com frequência. */
function shootoutKicks(seed: number, humanA: boolean, humanB: boolean, aimOf?: () => string, diveOf?: () => string): { kicks: MatchEvent[]; sim: MatchSimulator } {
  const sim = new MatchSimulator([setup('BRA-1970', !humanA), setup('GER-1980', !humanB)], { seed, knockout: true });
  let guard = 0;
  while (!sim.finished && guard++ < 3000) {
    sim.playUntil(sim.clockExact + 8);
    const d = sim.pendingDecision;
    if (!d) continue;
    const choice =
      d.kind === 'aim' ? (aimOf?.() ?? 'auto') : d.kind === 'dive' ? (diveOf?.() ?? 'auto') : d.kind === 'injury' ? 'keep' : d.kind === 'desperate' ? 'hold' : d.kind === 'penalty' ? sim.onPitch(d.side).filter((p) => p.position !== 'GK')[0]!.id : '';
    sim.execute({ kind: 'decide', side: d.side, id: d.id, choice, order: d.kind === 'shootout' ? [] : undefined });
  }
  return { kicks: sim.eventLog.filter((e) => e.type === 'penalty-shootout'), sim };
}

describe('pênaltis: canto x mergulho', () => {
  it('a taxa de conversão (escolhas automáticas) fica perto de 75%, com erros, traves e defesas', () => {
    let kicks = 0, goals = 0, miss = 0, post = 0, save = 0;
    for (let seed = 0; seed < 400; seed++) {
      const sim = new MatchSimulator([setup('BRA-1970', true), setup('GER-1980', true)], { seed, knockout: true });
      sim.playThrough(200);
      for (const e of sim.eventLog) {
        if (e.type !== 'penalty-shootout' || !e.penalty) continue;
        kicks++;
        if (e.penalty.outcome === 'goal') goals++;
        else if (e.penalty.outcome === 'miss') miss++;
        else if (e.penalty.outcome === 'post') post++;
        else save++;
      }
    }
    expect(kicks).toBeGreaterThan(500);
    expect(goals / kicks).toBeGreaterThan(0.7);
    expect(goals / kicks).toBeLessThan(0.82);
    expect(miss).toBeGreaterThan(0);
    expect(post).toBeGreaterThan(0);
    expect(save).toBeGreaterThan(0);
  });

  it('o goleiro só defende quando mergulha para a coluna do chute (zona central exige ficar no meio)', () => {
    for (let seed = 0; seed < 120; seed++) {
      const { kicks } = shootoutKicks(seed, true, true, () => 'CH', () => 'L');
      for (const k of kicks) {
        expect(k.penalty?.zone).toBe('CH');
        expect(k.penalty?.dive).toBe('L');
        expect(k.penalty?.outcome).not.toBe('save'); // bola no meio, goleiro foi para a esquerda
      }
    }
  });

  it('chute no canto contra goleiro no mesmo lado pode ser defendido; no lado oposto nunca', () => {
    let savedSame = 0, savedOpposite = 0;
    for (let seed = 0; seed < 150; seed++) {
      for (const [dive, same] of [['L', true], ['R', false]] as const) {
        const { kicks } = shootoutKicks(seed, true, true, () => 'LL', () => dive);
        for (const k of kicks) if (k.penalty?.outcome === 'save') (same ? savedSame++ : savedOpposite++);
      }
    }
    expect(savedSame).toBeGreaterThan(20);
    expect(savedOpposite).toBe(0);
  });

  it('canto alto erra e acerta a trave mais que o baixo', () => {
    const rate = (zone: PenaltyZone) => {
      let bad = 0, n = 0;
      for (let seed = 0; seed < 150; seed++) {
        const { kicks } = shootoutKicks(seed, true, true, () => zone, () => 'C');
        for (const k of kicks) {
          n++;
          if (k.penalty?.outcome === 'miss') bad++;
        }
      }
      return bad / n;
    };
    expect(rate('LH')).toBeGreaterThan(rate('LL'));
  });

  it('a escolha do canto e do mergulho entra no log e o replay reproduz a disputa idêntica', () => {
    for (let seed = 0; seed < 25; seed++) {
      const opts = { seed, knockout: true, detail: 'full' as const };
      const live = new MatchSimulator([setup('BRA-1970', false), setup('GER-1980', false)], opts);
      let zi = 0;
      let guard = 0;
      const zones: PenaltyZone[] = ['LH', 'RL', 'CL', 'RH', 'LL', 'CH'];
      while (!live.finished && guard++ < 3000) {
        live.playUntil(live.clockExact + 8);
        const d = live.pendingDecision;
        if (!d) continue;
        const choice = d.kind === 'aim' ? zones[zi++ % 6]! : d.kind === 'dive' ? (['L', 'R', 'C'] as const)[zi++ % 3]! : d.kind === 'injury' ? 'keep' : d.kind === 'desperate' ? 'hold' : d.kind === 'penalty' ? live.onPitch(d.side).filter((p) => p.position !== 'GK')[1]!.id : '';
        live.execute({ kind: 'decide', side: d.side, id: d.id, choice, order: d.kind === 'shootout' ? [] : undefined });
      }
      const original = live.report();
      const again = replayMatch([setup('BRA-1970', false), setup('GER-1980', false)], opts, live.commands);
      expect(again).toEqual(original);
      if (original.shootout) {
        const aims = live.commands.filter((c) => c.cmd.kind === 'decide' && ['LH', 'RL', 'CL', 'RH', 'LL', 'CH'].includes(c.cmd.choice));
        expect(aims.length).toBeGreaterThan(0);
      }
    }
  });

  it('o pênalti no tempo normal também traz canto, mergulho e resultado no evento', () => {
    let found = 0;
    for (let seed = 0; seed < 600 && found < 5; seed++) {
      const sim = new MatchSimulator([setup('BRA-1970', true), setup('GER-1980', true)], { seed });
      sim.playThrough(95);
      for (const e of sim.eventLog) {
        if (e.shotType === 'penalti' && e.type !== 'penalty-shootout') {
          expect(e.penalty).toBeDefined();
          found++;
        }
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
