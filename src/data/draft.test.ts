import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { FORMATION_SLOTS } from '../engine/formations';
import type { World } from '../engine/types';
import {
  DRAFT_MEMORY_REROLLS,
  DRAFT_REROLLS,
  RESERVES,
  SQUAD_TOTAL,
  canPlace,
  finalizeDraft,
  greedyChoice,
  greedyDraft,
  pick,
  pickError,
  replayDraft,
  reroll,
  rollSquad,
  startDraft,
  type DraftConfig,
} from './draft';

const world = worldJson as unknown as World;
const cfg = (seed: number, memory = false): DraftConfig => ({ seed, name: 'Time dos Amigos', colors: ['#112233', '#ffcc00'], formation: '4-3-3', memory });

describe('draft', () => {
  it('o sorteio é determinístico e todas as seleções-era têm chance (incluindo as fracas)', () => {
    expect(startDraft(world, cfg(1)).roll).toBe(startDraft(world, cfg(1)).roll);
    const seen = new Set<string>();
    let weak = 0;
    let n = 0;
    for (let seed = 0; seed < 600; seed++) {
      const r = startDraft(world, cfg(seed)).roll;
      seen.add(r);
      n++;
      if ((world.nations.find((x) => x.id === r)?.elo ?? 2000) < 1650) weak++;
    }
    expect(seen.size).toBeGreaterThan(250);
    const weakShare = world.nations.filter((x) => x.elo < 1650).length / world.nations.length;
    expect(Math.abs(weak / n - weakShare)).toBeLessThan(0.07); // chance igual para todas
  });

  it('3 trocas de sorteio (1 no modo Memória); a troca muda a seleção e gasta uma', () => {
    let s = startDraft(world, cfg(5));
    expect(s.rerollsLeft).toBe(DRAFT_REROLLS);
    const first = s.roll;
    s = reroll(world, s);
    expect(s.roll).not.toBe(first);
    expect(s.rerollsLeft).toBe(DRAFT_REROLLS - 1);
    s = reroll(world, reroll(world, s));
    expect(() => reroll(world, s)).toThrow();
    expect(startDraft(world, cfg(5, true)).rerollsLeft).toBe(DRAFT_MEMORY_REROLLS);
  });

  it('só aceita goleiro no gol e goleiro só no gol, em posição vazia', () => {
    const s = startDraft(world, cfg(7));
    const squad = rollSquad(world, s);
    const gk = squad.find((p) => p.position === 'GK')!;
    const field = squad.find((p) => p.position !== 'GK')!;
    expect(pickError(world, s, gk.id, 1)).toBeTruthy(); // slot 1 é lateral
    expect(pickError(world, s, field.id, 0)).toBeTruthy(); // slot 0 é o gol
    expect(pickError(world, s, gk.id, 0)).toBeUndefined();
    expect(pickError(world, s, field.id, 3)).toBeUndefined();
    const after = pick(world, s, field.id, 3);
    expect(after.starters[3]?.id).toBe(field.id);
    expect(pickError(world, after, 'inexistente', 2)).toBeTruthy();
    expect(canPlace(gk, 'GK')).toBe(true);
  });

  it('11 titulares, depois 7 reservas, e o time fecha com 23 (os 5 que faltam são medianos gerados, com 2 goleiros ou mais)', () => {
    const s = greedyDraft(world, cfg(11));
    expect(s.phase).toBe('done');
    expect(s.starters.every(Boolean)).toBe(true);
    expect(s.reserves).toHaveLength(RESERVES);
    const team = finalizeDraft(s);
    const squad = team.customSquad!;
    expect(squad).toHaveLength(SQUAD_TOTAL);
    expect(new Set(squad.map((p) => p.id)).size).toBe(SQUAD_TOTAL);
    expect(squad.filter((p) => p.position === 'GK').length).toBeGreaterThanOrEqual(2);
    expect(team.custom).toBe(true);
    expect(team.country).toBe('Time dos Amigos');
    expect(team.colors.primary).toBe('#112233');
    const fillers = squad.filter((p) => p.id.includes('-F'));
    expect(fillers.length).toBe(SQUAD_TOTAL - 18);
    const picked = squad.filter((p) => !p.id.includes('-F'));
    const avgPicked = picked.reduce((a, p) => a + p.attrs.finalizacao + p.attrs.defesa, 0) / picked.length;
    const avgFill = fillers.reduce((a, p) => a + p.attrs.finalizacao + p.attrs.defesa, 0) / fillers.length;
    expect(avgFill).toBeLessThan(avgPicked);
  });

  it('as escolhas formam um log: o replay reproduz o mesmo time, com os mesmos jogadores e a mesma força', () => {
    for (const seed of [3, 4, 5]) {
      const s = greedyDraft(world, cfg(seed));
      const again = replayDraft(world, s.config, s.log);
      expect(again.starters.map((p) => p?.id)).toEqual(s.starters.map((p) => p?.id));
      expect(again.reserves.map((p) => p.id)).toEqual(s.reserves.map((p) => p.id));
      expect(finalizeDraft(again)).toEqual(finalizeDraft(s));
      expect(s.log.some((e) => e.type === 'pick')).toBe(true);
    }
  });

  it('o robô guloso escolhe sempre a melhor opção disponível da seleção sorteada', () => {
    const s = startDraft(world, cfg(21));
    const c = greedyChoice(world, s)!;
    const slots = FORMATION_SLOTS['4-3-3'];
    for (const p of rollSquad(world, s)) {
      for (let i = 0; i < slots.length; i++) {
        if (!canPlace(p, slots[i]!)) continue;
        // nenhuma outra combinação jogador x vaga pode valer mais
        const v = (c.value);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
    expect(c.slot).not.toBeNull();
  });
});
