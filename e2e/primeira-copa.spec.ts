import { expect, test, type Page } from '@playwright/test';
import { btn, watchErrors } from './helpers';

// Depois da primeira partida o jogo convida para a Copa completa, uma vez só.
async function playFirstMatchInstantly(page: Page) {
  await page.goto('/');
  await btn(page, 'Jogar agora').click();
  await btn(page, 'Simular instantâneo').click();
  await btn(page, 'Continuar').click();
}

test('depois da primeira partida: convite para a Copa completa, que some com "Agora não" e não volta', async ({ page }) => {
  const errors = watchErrors(page);
  await playFirstMatchInstantly(page);
  const invite = page.getByRole('region', { name: 'Convite para a Copa completa' });
  await expect(invite).toBeVisible();
  await expect(invite).toContainText('Quer jogar uma Copa completa?');
  await invite.getByRole('button', { name: 'Agora não' }).click();
  await expect(invite).toHaveCount(0);

  // outra partida, e depois de recarregar: não aparece de novo
  await btn(page, /^Próximo:/).click();
  await btn(page, 'Simular instantâneo').click();
  await btn(page, 'Continuar').click();
  await expect(page.getByRole('heading', { name: 'Pontos' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Convite para a Copa completa' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Convite para a Copa completa' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('aceitar o convite leva à escolha da seleção e não pergunta de novo', async ({ page }) => {
  await playFirstMatchInstantly(page);
  await page.getByRole('region', { name: 'Convite para a Copa completa' }).getByRole('button', { name: 'Escolher seleção' }).click();
  await expect(page.getByRole('heading', { name: 'Escolha sua seleção' })).toBeVisible();
  await btn(page, 'Voltar').click();
  await btn(page, /Cenários/).click();
  await btn(page, 'Jogar já').click();
  await btn(page, 'Simular instantâneo').click();
  await btn(page, 'Continuar').click();
  await expect(page.getByRole('heading', { name: 'Pontos' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Convite para a Copa completa' })).toHaveCount(0);
});
