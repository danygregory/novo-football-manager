import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import { MAX_DECISIONS, MatchSimulator, replayMatch, type Decision, type TeamSetup } from './match';
import type { World } from './types';
import { squadOf } from '../data/squads';

const world = worldJson as unknown as World;
const get = (id: string) => world.nations.find((n) => n.id === id)!;
function setup(id: string, ai: boolean): TeamSetup {
  const n = get(id);
  const squad = autoSquad23(squadOf(n));
  return { nationId: id, name: n.country, squad, lineup: autoLineup(id, squad, tacticsForStyle(n.playStyle)), ai };
}
const mk = (seed: number, knockout = false) => new MatchSimulator([setup('BRA-1970', false), setup('GER-1980', true)], { seed, knockout });

/** Resposta padrão a qualquer decisão (para os testes que só querem o jogo andando). */
function answer(sim: MatchSimulator, d: Decision, penaltyTaker?: string): void {
  const choice =
    d.kind === 'injury' ? 'keep' : d.kind === 'desperate' ? 'hold' : d.kind === 'aim' || d.kind === 'dive' ? 'auto' : d.kind === 'penalty' ? (penaltyTaker ?? sim.onPitch(0).filter((p) => p.position !== 'GK')[0]!.id) : '';
  sim.execute({ kind: 'decide', side: d.side, id: d.id, choice, order: d.kind === 'shootout' ? [] : undefined });
}

/** Joga até aparecer uma decisão do tipo pedido (ou o jogo acabar). */
function untilDecision(sim: MatchSimulator, kind?: Decision['kind']): Decision | undefined {
  let guard = 0;
  while (!sim.finished && guard++ < 400) {
    sim.playUntil(sim.clockExact + 5);
    const d = sim.pendingDecision;
    if (!d) continue;
    if (!kind || d.kind === kind) return d;
    answer(sim, d);
  }
  return undefined;
}

describe('momentos de decisão', () => {
  it('a IA nunca pausa o jogo: só o time do usuário gera decisões', () => {
    for (let seed = 0; seed < 40; seed++) {
      const sim = new MatchSimulator([setup('BRA-1970', true), setup('GER-1980', true)], { seed });
      sim.playThrough(100);
      expect(sim.pendingDecision).toBeUndefined();
      expect(sim.finished).toBe(true);
    }
  });

  it('lesão: o jogo para, outros comandos são recusados e a troca resolve', () => {
    let found = 0;
    for (let seed = 0; seed < 150 && found < 3; seed++) {
      const sim = mk(seed);
      const d = untilDecision(sim, 'injury');
      if (!d || d.kind !== 'injury') continue;
      found++;
      const clock = sim.clockExact;
      expect(sim.execute({ kind: 'tactics', side: 0, tactics: { formation: '4-3-3', pressing: 0.5, lineHeight: 0.5, tempo: 0.5 } })).toBe(false);
      sim.playUntil(clock + 10);
      expect(sim.clockExact).toBe(clock); // parado
      const bench = sim.benchPlayers(0).find((p) => p.position === sim.onPitch(0).find((x) => x.id === d.playerId)?.position);
      expect(sim.execute({ kind: 'decide', side: 0, id: d.id, choice: bench!.id })).toBe(true);
      expect(sim.onPitch(0).some((p) => p.id === d.playerId)).toBe(false);
      expect(sim.pendingDecision).toBeUndefined();
    }
    expect(found).toBeGreaterThan(0);
  });

  it('manter o lesionado em campo reduz o rendimento dele (marcado como lesionado)', () => {
    for (let seed = 0; seed < 150; seed++) {
      const sim = mk(seed);
      const d = untilDecision(sim, 'injury');
      if (!d || d.kind !== 'injury') continue;
      sim.execute({ kind: 'decide', side: 0, id: d.id, choice: 'keep' });
      expect(sim.liveState().sides[0].onPitch.find((p) => p.id === d.playerId)?.injured).toBe(true);
      return;
    }
    throw new Error('nenhuma lesão encontrada');
  });

  it('perdendo após os 75: oferece tudo ou nada / segurar, e o tudo ou nada muda a tática', () => {
    for (let seed = 0; seed < 200; seed++) {
      const sim = mk(seed);
      const d = untilDecision(sim, 'desperate');
      if (!d) continue;
      expect(sim.clockExact).toBeGreaterThanOrEqual(75);
      expect(sim.currentScore[0]).toBeLessThan(sim.currentScore[1]);
      sim.execute({ kind: 'decide', side: 0, id: d.id, choice: 'allin' });
      expect(sim.tacticsOf(0).pressing).toBeGreaterThan(0.8);
      return;
    }
    throw new Error('nenhum jogo com atraso após os 75');
  });

  it('pênalti a favor: o usuário escolhe o batedor, e é ele quem cobra', () => {
    for (let seed = 0; seed < 400; seed++) {
      const sim = mk(seed);
      const d = untilDecision(sim, 'penalty');
      if (!d) continue;
      const taker = sim.onPitch(0).filter((p) => p.position !== 'GK').sort((a, b) => a.attrs.finalizacao - b.attrs.finalizacao)[0]!;
      sim.execute({ kind: 'decide', side: 0, id: d.id, choice: taker.id });
      // depois do batedor, o usuário escolhe o canto (aqui, automático)
      const aim = sim.pendingDecision;
      expect(aim?.kind).toBe('aim');
      sim.execute({ kind: 'decide', side: 0, id: aim!.id, choice: 'auto' });
      const ev = [...sim.eventLog].reverse().find((e) => e.shotType === 'penalti');
      expect(ev?.playerId).toBe(taker.id);
      return;
    }
    throw new Error('nenhum pênalti encontrado');
  });

  it('no máximo 3 pausas por partida (sem contar a disputa de pênaltis)', () => {
    for (let seed = 0; seed < 100; seed++) {
      const sim = mk(seed, true);
      let pauses = 0;
      let guard = 0;
      while (!sim.finished && guard++ < 500) {
        sim.playUntil(sim.clockExact + 4);
        const d = sim.pendingDecision;
        if (!d) continue;
        if (d.kind === 'injury' || d.kind === 'desperate' || d.kind === 'penalty') pauses++;
        answer(sim, d, sim.onPitch(0)[5]!.id);
      }
      expect(pauses).toBeLessThanOrEqual(MAX_DECISIONS);
    }
  });

  it('disputa de pênaltis: a ordem escolhida pelo usuário é a que bate', () => {
    for (let seed = 0; seed < 300; seed++) {
      const sim = mk(seed, true);
      let order: string[] | undefined;
      let guard = 0;
      while (!sim.finished && guard++ < 600) {
        sim.playUntil(sim.clockExact + 4);
        const d = sim.pendingDecision;
        if (!d) continue;
        if (d.kind === 'shootout') {
          order = sim.onPitch(0).filter((p) => p.position !== 'GK').map((p) => p.id).reverse();
          sim.execute({ kind: 'decide', side: 0, id: d.id, choice: '', order });
        } else answer(sim, d, sim.onPitch(0)[5]!.id);
      }
      if (!order) continue;
      const kicks = sim.eventLog.filter((e) => e.type === 'penalty-shootout' && e.team === 0).map((e) => e.playerId);
      expect(kicks.slice(0, 5)).toEqual(order.slice(0, 5));
      return;
    }
    throw new Error('nenhuma disputa de pênaltis encontrada');
  });

  it('o replay reproduz uma partida com decisões do usuário (lesão, pênalti, tudo ou nada, ordem)', () => {
    for (let seed = 0; seed < 60; seed++) {
      const opts = { seed, knockout: true, detail: 'full' as const };
      const live = new MatchSimulator([setup('BRA-1970', false), setup('GER-1980', true)], opts);
      let guard = 0;
      while (!live.finished && guard++ < 600) {
        live.playUntil(live.clockExact + 3.7);
        const d = live.pendingDecision;
        if (!d) continue;
        if (d.kind === 'shootout') live.execute({ kind: 'decide', side: 0, id: d.id, choice: '', order: live.onPitch(0).filter((p) => p.position !== 'GK').map((p) => p.id).slice(2) });
        else if (d.kind === 'penalty') live.execute({ kind: 'decide', side: 0, id: d.id, choice: live.onPitch(0)[7]!.id });
        else if (d.kind === 'desperate') live.execute({ kind: 'decide', side: 0, id: d.id, choice: 'allin' });
        else if (d.kind === 'aim') live.execute({ kind: 'decide', side: 0, id: d.id, choice: 'RH' });
        else if (d.kind === 'dive') live.execute({ kind: 'decide', side: 0, id: d.id, choice: 'L' });
        else live.execute({ kind: 'decide', side: 0, id: d.id, choice: 'keep' });
      }
      const original = live.report();
      const again = replayMatch([setup('BRA-1970', false), setup('GER-1980', true)], opts, live.commands);
      expect(again).toEqual(original);
    }
  });
});
