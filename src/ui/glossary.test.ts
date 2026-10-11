import { describe, expect, it } from 'vitest';
import { GLOSSARY, definitionOf } from './glossary';

describe('glossário', () => {
  it('explica os termos que um jogador novo não conhece, em frase completa', () => {
    for (const term of ['Elo', 'xG', 'pote', 'draft'] as const) {
      const d = definitionOf(term);
      expect(d.length, term).toBeGreaterThanOrEqual(40);
      expect(d.endsWith('.'), term).toBe(true);
      expect(d.toLowerCase(), term).not.toContain(term.toLowerCase() + ' é'); // não define o termo por ele mesmo
    }
    expect(Object.keys(GLOSSARY).sort()).toEqual(['Elo', 'draft', 'pote', 'xG']);
  });

  it('o Elo cita um exemplo do próprio jogo e o xG fala de chances', () => {
    expect(definitionOf('Elo')).toMatch(/\d{4}/);
    expect(definitionOf('xG')).toMatch(/chance/i);
  });
});
