import { expect, test, type Page } from '@playwright/test';
import { btn, watchErrors } from './helpers';

// Regressões achadas pelo /qa em 2026-10-09 (ISSUE-001 a 004): layout e textos que quebravam sem nenhum erro de console.

/** Seed fixa em que as duas Alemanhas (Ocidental e Oriental) caem na Copa dos anos 70: os nomes mais largos do jogo. */
const LINK_ALEMANHAS = '/#c=k%3Dcup%26n%3DBRA-1970%26u%3D1970%26s%3D1';

async function startChallengeCup(page: Page) {
  await page.goto(LINK_ALEMANHAS);
  await btn(page, 'Aceitar o desafio').click();
  await btn(page, 'Convocação automática').click();
  await btn(page, 'Confirmar').click();
  await btn(page, 'Iniciar a Copa').click();
  await expect(btn(page, /Jogar partida/)).toBeVisible();
}

test('ISSUE-001: nenhuma tabela de grupo passa da borda do card, nem com Alemanha Ocidental e Oriental', async ({ page }) => {
  const errors = watchErrors(page);
  await startChallengeCup(page);
  await expect(page.getByText('Alemanha Ocidental').first()).toBeVisible();
  await expect(page.getByText('Alemanha Oriental').first()).toBeVisible();
  const over = await page.evaluate(() =>
    [...document.querySelectorAll('.group')].map((g) => ({ nome: g.querySelector('h3')?.textContent, sobra: Math.round(g.querySelector('table')!.getBoundingClientRect().right - g.getBoundingClientRect().right) })).filter((x) => x.sobra > 0),
  );
  expect(over, 'tabelas que passam da borda do card').toEqual([]);
  expect(errors).toEqual([]);
});

test('ISSUE-002: convocação inválida mostra o motivo em texto (e some quando volta a ser válida)', async ({ page }) => {
  await page.goto('/');
  await btn(page, /Cenários/).click();
  await btn(page, 'Escalar o time').click();
  await expect(page.getByRole('status')).toHaveCount(0);
  // tirar um convocado deixa 22/23: o Confirmar desabilita e o porquê aparece escrito, não só no tooltip
  await page.locator('tbody tr').first().locator('td').nth(3).click();
  await expect(page.getByText('22/23')).toBeVisible();
  await expect(btn(page, 'Confirmar')).toBeDisabled();
  await expect(page.getByRole('status')).toHaveText(/Convoque exatamente 23 jogadores, com ao menos 2 goleiros/);
  await btn(page, 'Convocação automática').click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(btn(page, 'Confirmar')).toBeEnabled();
});

test.describe('celular', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('ISSUE-003: o título da campanha fica numa linha própria abaixo da marca, sem rolagem lateral', async ({ page }) => {
    await startChallengeCup(page);
    const m = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      return { brandBottom: r('.topbar .brand').bottom, crumbsTop: r('.crumbs').top, crumbsH: r('.crumbs').height, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
    });
    expect(m.crumbsTop, 'o título começa abaixo da marca').toBeGreaterThanOrEqual(m.brandBottom - 1);
    expect(m.crumbsH, 'o título cabe em uma linha').toBeLessThan(30);
    expect(m.sw).toBeLessThanOrEqual(m.iw + 1);
  });
});

test('ISSUE-004: fim de um cenário diz "Cenário encerrado", não "Copa encerrada"', async ({ page }) => {
  await page.goto('/');
  await btn(page, /Cenários/).click();
  await btn(page, 'Jogar já').click();
  await btn(page, 'Simular instantâneo').click();
  await btn(page, 'Continuar').click();
  await expect(page.locator('.crumbs')).toContainText('Cenário encerrado');
  await expect(page.locator('.crumbs')).not.toContainText('Copa encerrada');
});
