import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { btn, watchErrors } from './helpers';

// Revisão de jogabilidade: um jogador novo via 9 opções do mesmo peso, com jargão. Agora: uma ação principal, três cartões com ícone,
// duração e uma linha, e os demais modos em "Mais modos".
test('tela inicial: ação principal, três cartões com duração e os outros modos recolhidos', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(btn(page, 'Jogar agora')).toBeVisible();
  await expect(btn(page, 'Jogar agora')).toContainText('5 min');

  const cards = page.locator('.mode-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('Cenários');
  await expect(cards.nth(0)).toContainText('5 min');
  await expect(cards.nth(1)).toContainText('Copa completa');
  await expect(cards.nth(1)).toContainText('20 min');
  await expect(cards.nth(2)).toContainText('Carreira de técnico');
  await expect(cards.nth(2)).toContainText('várias Copas');
  for (let i = 0; i < 3; i++) await expect(cards.nth(i).locator('.mode-icon')).toBeVisible();

  // os outros modos ficam recolhidos até abrir "Mais modos"
  await expect(btn(page, /Desafio do dia/)).toBeHidden();
  await expect(btn(page, /Monte a sua/)).toBeHidden();
  await page.getByText('Mais modos', { exact: true }).click();
  await expect(btn(page, /Desafio do dia/)).toBeVisible();
  await expect(btn(page, /Monte a sua/)).toBeVisible();

  // sem jargão solto na tela inicial
  await expect(page.locator('body')).not.toContainText(/\bseed\b|Wordle|pote 4/i);
  const serious = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => v.id)).toEqual([]);
  expect(errors).toEqual([]);
});

test('glossário: Elo na preparação da partida explica o termo ao focar (teclado) ou passar o mouse', async ({ page }) => {
  await page.goto('/');
  await btn(page, 'Jogar agora').click();
  const term = page.locator('.term', { hasText: 'Elo' }).first();
  await expect(term).toBeVisible();
  await term.focus();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Nota de força' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});
