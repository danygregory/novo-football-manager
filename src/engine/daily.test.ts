import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { worldPercentile, worldPot } from './career';
import { bestOfDay, dailyCut, dailySeed, dailyTeam, shareText } from './daily';
import { squadOf } from '../data/squads';
import { autoLineup, autoSquad23, tacticsForStyle } from './lineup';
import type { CupSummary } from './scoring';
import { createTournament } from './tournament';
import type { World } from './types';

const world = worldJson as unknown as World;

describe('desafio do dia', () => {
  it('a mesma data dá a mesma seed, a mesma seleção fraca e a mesma Copa; outra data muda tudo', () => {
    expect(dailySeed('2026-10-04')).toBe(dailySeed('2026-10-04'));
    expect(dailySeed('2026-10-04')).not.toBe(dailySeed('2026-10-05'));
    expect(dailyTeam(world, '2026-10-04').id).toBe(dailyTeam(world, '2026-10-04').id);
    const teams = new Set(Array.from({ length: 30 }, (_, i) => dailyTeam(world, `2026-11-${String(i + 1).padStart(2, '0')}`).id));
    expect(teams.size).toBeGreaterThan(15);
  });

  it('a seleção do dia é sempre fraca (potes 3 e 4 do mundo)', () => {
    for (let i = 1; i <= 60; i++) expect(worldPot(world, dailyTeam(world, `2026-12-${String((i % 28) + 1).padStart(2, '0')}-${i}`).elo)).toBeGreaterThanOrEqual(3);
  });

  it('a seleção do dia não é a pior de todas (percentil 18 a 32) e a Copa é da época dela', () => {
    for (let i = 1; i <= 40; i++) {
      const date = `2027-01-${String((i % 28) + 1).padStart(2, '0')}-${i}`;
      const team = dailyTeam(world, date);
      const p = worldPercentile(world, team.elo);
      expect(p).toBeGreaterThanOrEqual(18);
      expect(p).toBeLessThanOrEqual(32);
      expect(dailyCut(world, team)).toBe(team.decade);
    }
  });

  it('todos recebem a mesma Copa: mesmos adversários, grupos e chaveamento', () => {
    const mk = (date: string) => {
      const n = dailyTeam(world, date);
      const squad = autoSquad23(squadOf(n));
      return createTournament(world, n.id, squad.map((p) => p.id), autoLineup(n.id, squad, tacticsForStyle(n.playStyle)), dailySeed(date), { cut: dailyCut(world, n) });
    };
    const a = mk('2026-10-04');
    const b = mk('2026-10-04');
    expect(b.participants).toEqual(a.participants);
    expect(b.groups).toEqual(a.groups);
    expect(mk('2026-10-05').groups).not.toEqual(a.groups);
  });

  const summary = (champion: boolean): CupSummary => ({
    ev: { stage: champion ? 5 : 2, w: champion ? 7 : 3, d: 1, l: champion ? 0 : 1, gf: 12, ga: 5, perf: 0, expectedStage: 0.25, pot: 4, rank: 30, champion },
    stageText: champion ? 'Campeão' : 'Quartas de final',
    matches: [
      { id: 'a', stage: 'G1', opp: 'X', result: 'W', penalties: false, mult: 1, points: 10 },
      { id: 'b', stage: 'G2', opp: 'X', result: 'D', penalties: false, mult: 1, points: 4 },
      { id: 'c', stage: 'G3', opp: 'X', result: 'W', penalties: false, mult: 1, points: 10 },
      { id: 'd', stage: 'R16', opp: 'X', result: 'W', penalties: true, mult: 1, points: 7 },
      { id: 'e', stage: 'QF', opp: 'X', result: 'L', penalties: false, mult: 1, points: 0 },
    ],
    matchPoints: 31,
    stageBonus: 40,
    campaignMult: 1,
    total: 71,
    facts: {} as never,
  });

  it('o texto compartilhável tem um quadrado por jogo, só dados da campanha e nenhum dado pessoal', () => {
    const team = dailyTeam(world, '2026-10-04');
    const text = shareText('2026-10-04', team, summary(false), 'Haiti anos 70');
    const lines = text.split('\n');
    expect(lines[0]).toBe('NOVO Football Manager · Desafio 2026-10-04');
    expect(lines[1]).toContain('Seleção do dia: Haiti anos 70 (pote 4');
    expect(lines[2]).toBe('🟩🟨🟩 | 🟩🟥');
    expect(lines[3]).toContain('Quartas de final · 3V 1E 1D · 12-5 gols');
    expect(lines[4]).toBe('Pontos: 71');
    expect(text).not.toMatch(/https?:|@|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    expect(shareText('2026-10-04', team, summary(true), 'Haiti anos 70')).toContain('🏆 Campeão');
  });

  it('guarda o melhor resultado do dia', () => {
    const a = { date: 'd', points: 50, stageText: 'x', champion: false, text: 'a' };
    const b = { ...a, points: 80, text: 'b' };
    expect(bestOfDay(undefined, a)).toBe(a);
    expect(bestOfDay(a, b)).toBe(b);
    expect(bestOfDay(b, a)).toBe(b);
  });
});
