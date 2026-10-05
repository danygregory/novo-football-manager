import { describe, expect, it } from 'vitest';
import { baseUrl, encodeChallenge, parseChallenge, type Challenge, type Known } from './link';

const known: Known = { nation: (id) => id === 'HUN-1954-1957' || id === 'BRA-1970', scenario: (id) => id === 'maracana' };

describe('links de desafio', () => {
  const cases: Challenge[] = [
    { kind: 'cup', nationId: 'HUN-1954-1957', cut: 'all', seed: 123456, points: 59, stage: 'Semifinais' },
    { kind: 'cup', nationId: 'BRA-1970', cut: 1970, seed: 4294967295 },
    { kind: 'scenario', id: 'maracana', points: 140 },
    { kind: 'daily', date: '2026-10-05' },
  ];
  it('ida e volta', () => {
    for (const c of cases) expect(parseChallenge(encodeChallenge(c), known)).toEqual({ points: undefined, ...c });
  });
  it('recusa lixo, seleção ou cenário desconhecido e valores fora de faixa', () => {
    const bad = [
      '', '#', '#c=', '#c=k%3Dcup', '#c=' + 'x'.repeat(400),
      encodeChallenge({ kind: 'cup', nationId: 'XXX-1900', cut: 'all', seed: 1 }),
      encodeChallenge({ kind: 'cup', nationId: 'BRA-1970', cut: 1975 as never, seed: 1 }),
      encodeChallenge({ kind: 'cup', nationId: 'BRA-1970', cut: 'all', seed: -1 }),
      encodeChallenge({ kind: 'cup', nationId: 'BRA-1970', cut: 'all', seed: 2 ** 33 }),
      encodeChallenge({ kind: 'scenario', id: 'nao-existe' }),
      encodeChallenge({ kind: 'daily', date: '5/10/2026' }),
      '#c=%E0%A4%A',
    ];
    for (const h of bad) expect(parseChallenge(h, known), h).toBeUndefined();
  });
  it('pontos inválidos são ignorados e o texto da etapa é limpo', () => {
    const h = '#c=' + encodeURIComponent('k=cup&n=BRA-1970&u=all&s=7&p=99999999&e=<script>alert(1)</script>');
    const c = parseChallenge(h, known);
    expect(c).toMatchObject({ kind: 'cup', points: undefined });
    expect(c && c.kind === 'cup' ? c.stage : '').not.toMatch(/[<>()]/);
  });
  it('baseUrl descarta o hash', () => {
    expect(baseUrl({ origin: 'https://x.github.io', pathname: '/novo/' })).toBe('https://x.github.io/novo/');
  });
});
