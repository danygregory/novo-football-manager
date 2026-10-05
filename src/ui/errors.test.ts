import { describe, expect, it } from 'vitest';
import { describeError, isBenignError } from './errors';

describe('erros da interface', () => {
  it('ignora erros benignos do navegador, mas não os do jogo', () => {
    expect(isBenignError('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(isBenignError('Script error.')).toBe(true);
    expect(isBenignError('Cannot read properties of undefined (reading "id")')).toBe(false);
  });

  it('o diagnóstico traz mensagem, início da pilha e versão, sem dados pessoais', () => {
    const text = describeError(new Error('falhou ao simular'), '0.1.0');
    expect(text).toContain('NOVO Football Manager (0.1.0)');
    expect(text).toContain('Error: falhou ao simular');
    expect(text.split('\n').length).toBeLessThanOrEqual(10);
    expect(describeError('texto solto')).toContain('texto solto');
    expect(describeError({ a: 1 })).toContain('{"a":1}');
    expect(text).not.toMatch(/localStorage|@|https?:/);
  });
});
