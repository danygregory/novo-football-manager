import { describe, expect, it } from 'vitest';
import { applyImport, exportSave, MAX_SAVE_BYTES, MemoryTextStore, parseSave, SaveRepository, SAVE_FORMAT, SAVE_VERSION, STORAGE_KEY } from '.';
import { ENGINE_VERSION, EngineVersionError } from '../engine';
import { autoLineup, autoSquad23, tacticsForStyle } from '../engine/lineup';
import { buildSetup, createTournament, replayRecord, startRecord, userFixture } from '../engine/tournament';
import type { World } from '../engine/types';
import { squadOf } from '../data/squads';
import worldJson from '../../data/world.json';

const entry = { n: 1, nationId: 'BRA-1970', teamLabel: 'Brasil anos 70', cut: 'all', stage: 3, w: 3, d: 1, l: 1, gf: 8, ga: 4, champion: false, pot: 1, repBefore: 20, repAfter: 30, points: 120 };
const career = { id: 'career-1', seed: 1, rep: 30, entries: [entry] };
const ranking = [{ date: '2026-01-02', mode: 'ready', team: 'Brasil', points: 100, stageText: 'Semifinal', w: 3, d: 1, l: 1, gf: 8, ga: 4, pot: 1, champion: false }];

const filled = () => {
  const repo = new SaveRepository(new MemoryTextStore());
  repo.save('career', career as never);
  repo.save('ranking', ranking as never);
  repo.save('achievements', { first: '2026-01-02' });
  repo.save('stats', { cups: 3 });
  repo.save('settings', { speed: 4, reduceMotion: true });
  return repo;
};

describe('SaveRepository', () => {
  it('lê de volta o que gravou', () => {
    const repo = filled();
    expect(repo.load('career')?.entries).toHaveLength(1);
    expect(repo.load('stats')).toEqual({ cups: 3 });
    expect(repo.load('settings')).toEqual({ speed: 4, reduceMotion: true });
  });

  it('dado corrompido ou adulterado vira indefinido, sem lançar', () => {
    const store = new MemoryTextStore();
    const repo = new SaveRepository(store);
    store.set(STORAGE_KEY.career, '{nao e json');
    store.set(STORAGE_KEY.ranking, JSON.stringify([{ date: 'ontem', mode: 'x' }]));
    store.set(STORAGE_KEY.achievements, '{"__proto__":"2026-01-01"}');
    store.set(STORAGE_KEY.daily, JSON.stringify({ '2026-01-01': { date: '2026-01-01', points: 'muitos' } }));
    store.set(STORAGE_KEY.stats, JSON.stringify({ cups: -5 }));
    for (const k of ['career', 'ranking', 'achievements', 'daily', 'stats'] as const) expect(repo.load(k)).toBeUndefined();
  });

  it('objetos indexados por id não ganham protótipo e rejeitam chaves perigosas', () => {
    const repo = new SaveRepository(new MemoryTextStore());
    repo.save('achievements', { a: '2026-01-02' });
    const got = repo.load('achievements')!;
    expect(Object.getPrototypeOf(got)).toBeNull();
    expect(Object.hasOwn(got, 'toString')).toBe(false);
  });
});

describe('arquivo de save', () => {
  it('exporta e importa de volta', () => {
    const text = exportSave(filled());
    const r = parseSave(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.engineVersion).toBe(ENGINE_VERSION);
    const repo2 = new SaveRepository(new MemoryTextStore());
    applyImport(repo2, r.data);
    expect(repo2.load('career')?.rep).toBe(30);
    expect(repo2.load('ranking')).toHaveLength(1);
  });

  const wrap = (data: unknown, extra: object = {}) => JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, engineVersion: ENGINE_VERSION, data, ...extra });

  it('recusa lixo, formato errado, versão futura e arquivos enormes', () => {
    expect(parseSave('isso nao e json').ok).toBe(false);
    expect(parseSave('[]').ok).toBe(false);
    expect(parseSave(JSON.stringify({ format: 'outro', version: 1, data: {} })).ok).toBe(false);
    expect(parseSave(wrap({}, { version: SAVE_VERSION + 1 })).ok).toBe(false);
    expect(parseSave(wrap({}, { version: 0 })).ok).toBe(false);
    expect(parseSave(wrap(null)).ok).toBe(false);
    expect(parseSave(' '.repeat(MAX_SAVE_BYTES + 1)).ok).toBe(false);
  });

  it('recusa campo inválido e ignora chave desconhecida', () => {
    expect(parseSave(wrap({ stats: { cups: 'x' } })).ok).toBe(false);
    expect(parseSave(wrap({ career: { ...career, entries: [{ ...entry, nationId: '../../x' }] } })).ok).toBe(false);
    const r = parseSave(wrap({ stats: { cups: 2 }, evil: { a: 1 }, constructor: 1 }));
    expect(r.ok && r.data).toEqual({ stats: { cups: 2 } });
  });

  it('confere se as seleções da carreira existem', () => {
    const text = wrap({ career });
    expect(parseSave(text, () => true).ok).toBe(true);
    expect(parseSave(text, (id) => id !== 'BRA-1970').ok).toBe(false);
  });
});

describe('versão do motor', () => {
  it('replay de partida de outra versão lança EngineVersionError', () => {
    const world = worldJson as unknown as World;
    const nation = world.nations.find((n) => n.id === 'BRA-1970')!;
    const squad = autoSquad23(squadOf(nation));
    const lineup = autoLineup(nation.id, squad, tacticsForStyle(nation.playStyle));
    const t = createTournament(world, nation.id, squad.map((p) => p.id), lineup, 7);
    const fx = userFixture(t, world)!;
    const rec = startRecord(t, fx, [buildSetup(world, t, fx.home, fx.home === t.userNationId), buildSetup(world, t, fx.away, fx.away === t.userNationId)]);
    expect(rec.engineVersion).toBe(ENGINE_VERSION);
    expect(() => replayRecord(world, { ...rec, engineVersion: ENGINE_VERSION + 1 })).toThrow(EngineVersionError);
    expect(() => replayRecord(world, rec)).not.toThrow();
  });
});
