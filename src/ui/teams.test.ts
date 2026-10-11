import { describe, expect, it } from 'vitest';
import worldJson from '../../data/world.json';
import type { World } from '../engine/types';
import { colorDistance, kitColors, stageTitle } from './teams';

const world = worldJson as unknown as World;
const nation = (id: string) => world.nations.find((n) => n.id === id)!;

describe('cores das camisas (kitColors)', () => {
  it('duas seleções do mesmo país (Brasil 70 e Brasil de hoje) saem com cores bem distintas', () => {
    const [a, b] = kitColors(nation('BRA-1970'), nation('BRA-2020'));
    expect(a).toBe(nation('BRA-1970').colors.primary);
    expect(colorDistance(a, b)).toBeGreaterThanOrEqual(90);
  });

  it('seleções de cores diferentes mantêm a cor principal de cada uma', () => {
    const [a, b] = kitColors(nation('BRA-1970'), nation('ARG-2020'));
    expect(a).toBe(nation('BRA-1970').colors.primary);
    expect(b).toBe(nation('ARG-2020').colors.primary);
  });

  it('sem nenhuma cor distinta, o adversário fica de azul', () => {
    const a = { colors: { primary: '#112233', secondary: '#445566' } };
    const b = { colors: { primary: '#112233', secondary: '#112234' } };
    expect(kitColors(a, b)).toEqual(['#112233', '#3b82d6']);
  });

  it('nenhum par de seleções do jogo termina com cores parecidas (o campo precisa distinguir os times)', () => {
    const sample = world.nations.filter((_, i) => i % 7 === 0);
    for (const x of sample) for (const y of sample) {
      const [c0, c1] = kitColors(x, y);
      expect(colorDistance(c0, c1), `${x.id} x ${y.id}`).toBeGreaterThanOrEqual(90);
    }
  });
});

describe('título da partida (stageTitle)', () => {
  it('num cenário usa o nome do cenário, não "Final"', () => {
    expect(stageTitle({ scenario: { id: 'milagre-berna', opponent: 'GER-1950' } }, 'F')).toBe('O milagre de Berna');
    expect(stageTitle({ scenario: { id: 'maracanazo', opponent: 'BRA-1950' } }, 'F')).toBe('Maracanazo');
  });

  it('numa Copa usa o nome da fase', () => {
    expect(stageTitle({}, 'R16')).toBe('Oitavas de final');
    expect(stageTitle({}, 'F')).toBe('Final');
  });

  it('cenário desconhecido (save de outra versão) cai no nome da fase em vez de quebrar', () => {
    expect(stageTitle({ scenario: { id: 'nao-existe', opponent: 'X' } }, 'F')).toBe('Final');
  });
});
