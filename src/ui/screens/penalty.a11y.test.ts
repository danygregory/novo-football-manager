import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PenaltyScene, zoneControl } from './PenaltyScreen';

// Regressão do QA (ISSUE-007): as zonas de escolha do pênalti eram <g onClick> dentro de <svg role="img">: só funcionavam com mouse ou toque
// e ficavam escondidas de leitor de tela. Quem usa só o teclado só podia escolher "Automático".
const scene = (choose?: { kind: 'aim' | 'dive'; pick: (c: never) => void }) =>
  renderToStaticMarkup(createElement(PenaltyScene, { takerName: 'Batedor', keeperName: 'Goleiro', takerColor: '#c00', keeperColor: '#06c', choose: choose as never }));
const buttons = (html: string) => [...html.matchAll(/<g[^>]*role="button"[^>]*>/g)].map((m) => m[0]);

describe('zonas de escolha do pênalti (acessibilidade)', () => {
  it('o lado do goleiro: 3 botões focáveis com rótulo, e o <svg> deixa de ser role="img" para os filhos aparecerem', () => {
    const html = scene({ kind: 'dive', pick: () => undefined });
    const b = buttons(html);
    expect(b).toHaveLength(3);
    for (const tag of b) expect(tag).toContain('tabindex="0"');
    expect(b.map((t) => /aria-label="([^"]+)"/.exec(t)?.[1])).toEqual(['Goleiro: pular para a esquerda', 'Goleiro: ficar no meio', 'Goleiro: pular para a direita']);
    expect(html).not.toMatch(/<svg[^>]*role="img"/);
    expect(html).toMatch(/<svg[^>]*role="group"/);
  });

  it('o canto da cobrança: 6 botões com o rótulo do canto', () => {
    const b = buttons(scene({ kind: 'aim', pick: () => undefined }));
    expect(b).toHaveLength(6);
    const labels = b.map((t) => /aria-label="([^"]+)"/.exec(t)?.[1]);
    expect(new Set(labels).size).toBe(6);
    for (const l of labels) expect(l).toMatch(/^Chutar no /);
  });

  it('sem escolha, a cena continua sendo uma imagem com descrição e sem botões', () => {
    const html = scene();
    expect(buttons(html)).toHaveLength(0);
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="Cobrança de pênalti"/);
  });

  it('Enter e Espaço escolhem (sem rolar a página); outras teclas não fazem nada', () => {
    const pick = vi.fn();
    const props = zoneControl('Goleiro: ficar no meio', pick);
    expect(props.role).toBe('button');
    expect(props.tabIndex).toBe(0);
    for (const key of ['Enter', ' ']) {
      const preventDefault = vi.fn();
      props.onKeyDown({ key, preventDefault });
      expect(preventDefault, key).toHaveBeenCalledOnce();
    }
    expect(pick).toHaveBeenCalledTimes(2);
    props.onKeyDown({ key: 'Tab', preventDefault: vi.fn() });
    props.onKeyDown({ key: 'a', preventDefault: vi.fn() });
    expect(pick).toHaveBeenCalledTimes(2);
    props.onClick();
    expect(pick).toHaveBeenCalledTimes(3);
  });
});
