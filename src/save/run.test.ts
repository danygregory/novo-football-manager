import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { finalizeDraft, greedyDraft } from '../data/draft';
import { squadOf } from '../data/squads';
import { autoLineup, autoSquad23, tacticsForStyle } from '../engine/lineup';
import { MatchSimulator, simulateMatch } from '../engine/match';
import { createScenario, SCENARIOS } from '../engine/scenarios';
import { buildSetup, createTournament, fixtureSeed, playRound, startRecord, userFixture, withCustom, type Tournament } from '../engine/tournament';
import type { World } from '../engine/types';
import { applyImport, exportSave, MemoryTextStore, parseSave, run, runIds, SaveRepository, type Run } from '.';

const world = worldJson as unknown as World;

/** Joga `rounds` rodadas ao vivo (com comandos) e devolve a Copa no meio do caminho. */
function cupAfter(rounds: number, custom?: ReturnType<typeof finalizeDraft>): Tournament {
  const w = withCustom(world, custom);
  const nation = custom ?? world.nations.find((n) => n.id === 'BRA-1970')!;
  const squad = autoSquad23(squadOf(nation));
  let t = createTournament(world, nation.id, squad.map((p) => p.id), autoLineup(nation.id, squad, tacticsForStyle(nation.playStyle)), 31, { custom });
  for (let i = 0; i < rounds; i++) {
    const f = userFixture(t, w)!;
    const setups = [buildSetup(w, t, f.home, f.home === t.userNationId), buildSetup(w, t, f.away, f.away === t.userNationId)] as Parameters<typeof startRecord>[2];
    const sim = new MatchSimulator(setups, { seed: fixtureSeed(t, f), knockout: false, detail: 'full' });
    const rec = startRecord(t, f, setups);
    const side = rec.userSide;
    sim.playThrough(20.5);
    sim.execute({ kind: 'shout', side, shout: 'press' });
    sim.playThrough(60);
    sim.execute({ kind: 'talk', side, tone: 'calm' });
    const report = sim.playToEnd();
    rec.commands = [...sim.commands];
    t = playRound(world, t, report, rec).tournament;
  }
  return t;
}

const wrap = (t: Tournament, extra: Partial<Run> = {}): Run => ({ v: 1, savedAt: '2026-10-05T10:00:00.000Z', mode: 'ready', tournament: t, ...extra });
const viaJson = (r: Run) => run(JSON.parse(JSON.stringify(r)));

describe('Copa em andamento no save', () => {
  it('uma Copa no meio do caminho (com comandos gravados) volta idêntica depois de JSON + validação', () => {
    const t = cupAfter(2);
    expect(t.userMatches).toHaveLength(2);
    expect(t.userMatches[0]!.commands.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(viaJson(wrap(t))))).toEqual(JSON.parse(JSON.stringify(wrap(t))));
  });

  it('time do draft (elenco próprio) também', () => {
    const state = greedyDraft(world, { seed: 5, name: 'Meu Time', colors: ['#112233', '#ffeedd'], formation: '4-3-3' } as never);
    const custom = finalizeDraft(state);
    const t = cupAfter(1, custom);
    const back = viaJson(wrap(t, { mode: 'draft' }));
    expect(back?.tournament.custom?.customSquad).toHaveLength(custom.customSquad!.length);
    expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(JSON.stringify(wrap(t, { mode: 'draft' }))));
  });

  it('cenário, desafio e desafio do dia guardam o contexto', () => {
    const sc = SCENARIOS[0]!;
    const nation = world.nations.find((n) => n.id === sc.user)!;
    const squad = autoSquad23(squadOf(nation));
    const t = createScenario(world, sc, squad.map((p) => p.id), autoLineup(nation.id, squad, tacticsForStyle(nation.playStyle)));
    const r = wrap(t, { mode: 'scenario', scenarioId: sc.id });
    expect(viaJson(r)?.scenarioId).toBe(sc.id);
    expect(viaJson(wrap(cupAfter(0), { mode: 'daily', dailyDate: '2026-10-05', challenge: { nationId: 'BRA-1970', cut: 'all', seed: 3, points: 50, stage: 'Final' } }))).toMatchObject({ dailyDate: '2026-10-05', challenge: { points: 50 } });
  });

  it('recusa estrutura adulterada em qualquer ponto', () => {
    const base = JSON.parse(JSON.stringify(wrap(cupAfter(1))));
    const mutate = (fn: (r: any) => void) => { const c = JSON.parse(JSON.stringify(base)); fn(c); return run(c); };
    expect(run(base)).toBeDefined();
    expect(mutate((r) => (r.v = 2))).toBeUndefined();
    expect(mutate((r) => (r.mode = 'hack'))).toBeUndefined();
    expect(mutate((r) => (r.tournament.stage = 'XX'))).toBeUndefined();
    expect(mutate((r) => (r.tournament.seed = -1))).toBeUndefined();
    expect(mutate((r) => (r.tournament.userNationId = '../x'))).toBeUndefined();
    expect(mutate((r) => (r.tournament.results[0].score = [1, 'a']))).toBeUndefined();
    expect(mutate((r) => (r.tournament.userMatches[0].commands[0].cmd.kind = 'rm -rf'))).toBeUndefined();
    expect(mutate((r) => (r.tournament.userLineup.starters.pop()))).toBeUndefined();
    expect(mutate((r) => (r.tournament.cond['x'] = 'cheio'))).toBeUndefined();
    expect(mutate((r) => r.tournament.userMatches.push(...Array(9).fill(r.tournament.userMatches[0])))).toBeUndefined();
    expect(mutate((r) => (r.tournament.squads = JSON.parse('{"__proto__":["a"]}')))).toBeUndefined();
    expect(mutate((r) => (r.tournament.results = Array(101).fill(r.tournament.results[0])))).toBeUndefined();
  });

  it('arquivo de save: ida e volta com a Copa e recusa de seleção inexistente', () => {
    const repo = new SaveRepository(new MemoryTextStore());
    const r = wrap(cupAfter(1));
    repo.save('run', r);
    const text = exportSave(repo);
    const known = (id: string) => world.nations.some((n) => n.id === id);
    const parsed = parseSave(text, known);
    expect(parsed.ok && parsed.data.run?.tournament.stage).toBe(r.tournament.stage);
    const repo2 = new SaveRepository(new MemoryTextStore());
    if (parsed.ok) applyImport(repo2, parsed.data);
    expect(repo2.load('run')?.tournament.seed).toBe(r.tournament.seed);
    expect(parseSave(text, (id) => id !== 'BRA-1970').ok).toBe(false);
    expect(runIds(r).length).toBeGreaterThan(30);
  });
});

// Regressão do QA (ISSUE-008): um save válido pelo esquema, mas incoerente (Copa nas semifinais sem grupos nem resultados), era aceito no
// import, derrubava a tela ao agir sobre ele e continuava salvo.
describe('coerência da Copa salva', () => {
  /** Uma Copa real, da 1ª rodada até o fim, com todas as fases pelo caminho. */
  function everyStage(): Tournament[] {
    const nation = world.nations.find((n) => n.id === 'BRA-1970')!;
    const squad = autoSquad23(squadOf(nation));
    let t = createTournament(world, nation.id, squad.map((p) => p.id), autoLineup(nation.id, squad, tacticsForStyle(nation.playStyle)), 31);
    const out = [t];
    while (t.stage !== 'DONE') {
      const f = userFixture(t, world);
      const report = f
        ? simulateMatch([buildSetup(world, t, f.home, f.home === t.userNationId), buildSetup(world, t, f.away, f.away === t.userNationId)], { seed: fixtureSeed(t, f), knockout: !t.stage.startsWith('G'), detail: 'summary' })
        : undefined;
      t = playRound(world, t, report).tournament;
      out.push(t);
    }
    return out;
  }
  const stages = everyStage();
  const mutate = (t: Tournament, fn: (c: any) => void) => {
    const c = JSON.parse(JSON.stringify(wrap(t)));
    fn(c.tournament);
    return run(c);
  };

  it('uma Copa real é aceita em todas as fases (G1 a DONE)', () => {
    expect(stages.map((t) => t.stage)).toEqual(['G1', 'G2', 'G3', 'R16', 'QF', 'SF', 'F', 'DONE']);
    for (const t of stages) expect(viaJson(wrap(t)), `fase ${t.stage}`).toBeDefined();
  });

  it('um cenário (partida única) é aceito antes e depois de jogar', () => {
    const sc = SCENARIOS[0]!;
    const nation = world.nations.find((n) => n.id === sc.user)!;
    const squad = autoSquad23(squadOf(nation));
    const t = createScenario(world, sc, squad.map((p) => p.id), autoLineup(nation.id, squad, tacticsForStyle(nation.playStyle)));
    expect(viaJson(wrap(t, { mode: 'scenario', scenarioId: sc.id }))).toBeDefined();
    const f = userFixture(t, world)!;
    const report = simulateMatch([buildSetup(world, t, f.home, f.home === t.userNationId), buildSetup(world, t, f.away, f.away === t.userNationId)], { seed: fixtureSeed(t, f), knockout: true, detail: 'summary' });
    const done = playRound(world, t, report).tournament;
    expect(done.stage).toBe('DONE');
    expect(viaJson(wrap(done, { mode: 'scenario', scenarioId: sc.id }))).toBeDefined();
  });

  it('é recusada a Copa que não bate com a fase: sem resultados, sem grupos, com resultados a mais ou a menos', () => {
    const sf = stages.find((t) => t.stage === 'SF')!;
    expect(mutate(sf, (t) => (t.results = []))).toBeUndefined();
    expect(mutate(sf, (t) => (t.groups = []))).toBeUndefined();
    expect(mutate(sf, (t) => t.results.pop())).toBeUndefined();
    expect(mutate(sf, (t) => t.results.push({ ...t.results[0], id: 'EXTRA' }))).toBeUndefined();
    expect(mutate(stages[0]!, (t) => (t.results = sf.results))).toBeUndefined(); // resultados de uma Copa adiantada numa Copa no início
  });

  it('é recusada a Copa cujos participantes não fecham: só 5, repetidos, fora dos grupos ou sem o time do usuário', () => {
    const t = stages.find((x) => x.stage === 'R16')!;
    expect(mutate(t, (c) => (c.participants = c.participants.slice(0, 5)))).toBeUndefined();
    expect(mutate(t, (c) => (c.participants[1] = c.participants[0]))).toBeUndefined();
    expect(mutate(t, (c) => (c.groups[0][0] = 'ZZZ-1999'))).toBeUndefined();
    expect(mutate(t, (c) => (c.userNationId = 'ARG-1970'))).toBeUndefined();
    expect(mutate(t, (c) => delete c.squads[c.userNationId])).toBeUndefined();
  });
});
