import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import type { World } from '../engine/types';
import { CLASSICS } from './classics';

const world = worldJson as unknown as World;

describe('clássicos da Seleção pronta', () => {
  it('são 4 seleções-era distintas que existem no jogo', () => {
    expect(CLASSICS).toHaveLength(4);
    expect(new Set(CLASSICS).size).toBe(4);
    for (const id of CLASSICS) expect(world.nations.some((n) => n.id === id), id).toBe(true);
  });

  it('são as pedidas: Brasil 70, Hungria 54, Holanda dos anos 70 e Espanha 2010', () => {
    expect([...CLASSICS]).toEqual(['BRA-1970', 'HUN-1954-1957', 'NED-1975-1979', 'ESP-2010-2013']);
  });
});
