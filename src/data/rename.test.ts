import { afterEach, describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import { autoLineup, autoSquad23, tacticsForStyle } from '../engine/lineup';
import { simulateMatch } from '../engine/match';
import type { TeamSetup } from '../engine/match';
import type { World } from '../engine/types';
import { names, playerName } from '../save/guards';
import { nameOverrides, setNameOverrides, squadOf } from './squads';

const world = worldJson as unknown as World;
const nation = (id: string) => world.nations.find((n) => n.id === id)!;
const setup = (id: string, ai: boolean): TeamSetup => {
  const n = nation(id);
  const squad = autoSquad23(squadOf(n));
  return { nationId: id, name: n.country, squad, lineup: autoLineup(id, squad, tacticsForStyle(n.playStyle)), ai };
};

afterEach(() => setNameOverrides({}));

describe('nomes personalizados', () => {
  it('trocam só o texto: placar, eventos e notas são os mesmos', () => {
    const base = simulateMatch([setup('BRA-1970', false), setup('GER-1980', true)], { seed: 5, knockout: true, detail: 'full' });
    const star = squadOf(nation('BRA-1970'))[3]!;
    setNameOverrides({ [star.id]: 'Fulano da Silva' });
    expect(squadOf(nation('BRA-1970'))[3]!.name).toBe('Fulano da Silva');
    const renamed = simulateMatch([setup('BRA-1970', false), setup('GER-1980', true)], { seed: 5, knockout: true, detail: 'full' });
    expect(renamed.score).toEqual(base.score);
    expect(renamed.ratings).toEqual(base.ratings);
    expect(renamed.events.map((e) => [e.type, e.minute, e.team, e.playerId])).toEqual(base.events.map((e) => [e.type, e.minute, e.team, e.playerId]));
    const text = JSON.stringify(renamed.events);
    expect(base.events.some((e) => e.playerId === star.id) ? text.includes('Fulano da Silva') : true).toBe(true);
  });

  it('o elenco original continua intacto ao restaurar', () => {
    const before = squadOf(nation('BRA-1970')).map((p) => p.name);
    setNameOverrides({ [squadOf(nation('BRA-1970'))[0]!.id]: 'X' });
    setNameOverrides({});
    expect(squadOf(nation('BRA-1970')).map((p) => p.name)).toEqual(before);
    expect(nameOverrides()).toEqual({});
  });

  it('validação: tamanho, controle e espaços; mapas com chave perigosa são recusados', () => {
    expect(playerName('  Zé   da  Silva ')).toBe('Zé da Silva');
    expect(playerName('')).toBeUndefined();
    expect(playerName('x'.repeat(41))).toBeUndefined();
    expect(playerName('a\u0000b‮b')).toBe('abb');
    expect(playerName(5)).toBeUndefined();
    expect(names({ 'BRA-1970-01': 'Nome' })).toEqual({ 'BRA-1970-01': 'Nome' });
    expect(names(JSON.parse('{"__proto__":"x"}'))).toBeUndefined();
    expect(names({ 'BRA-1970-01': 7 })).toBeUndefined();
  });
});
