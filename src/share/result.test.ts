import { describe, expect, it } from 'vitest';
import type { CupSummary } from '../engine/scoring';
import { cupShare } from './result';

const summary = { total: 59, stageText: 'Semifinais', ev: { w: 4, d: 0, l: 2, gf: 11, ga: 6, champion: false } } as unknown as CupSummary;
summary.matches = [{ stage: 'G1', result: 'W' }, { stage: 'G2', result: 'D' }, { stage: 'SF', result: 'L' }] as never;
const base = { summary, team: 'Hungria', era: '1954–57', colors: { primary: '#aa0000', secondary: '#00aa00' }, mode: 'Copa', url: 'https://x.dev/jogo/' };

describe('texto e cartão de compartilhamento', () => {
  it('traz campanha, pontos e o link do desafio', () => {
    const r = cupShare({ ...base, link: 'https://x.dev/jogo/#c=abc' });
    expect(r.text).toContain('Hungria 1954–57: Semifinais · 4V 0E 2D · 11–6 gols · 59 pts');
    expect(r.text).toContain('https://x.dev/jogo/#c=abc');
    expect(r.text).toContain('🟩🟨 | 🟥');
    expect(r.card).toMatchObject({ points: 59, headline: 'Semifinais', champion: false, url: 'x.dev/jogo/' });
  });
  it('sem link (draft) convida a jogar e campeã ganha destaque', () => {
    const r = cupShare({ ...base, summary: { ...summary, ev: { ...summary.ev, champion: true } } as CupSummary });
    expect(r.text).toContain('🏆');
    expect(r.text).toContain('Jogue em https://x.dev/jogo/');
    expect(r.card.headline).toBe('Campeã do mundo');
  });
});
