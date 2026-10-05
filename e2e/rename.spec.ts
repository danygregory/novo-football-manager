import { expect, test } from '@playwright/test';
import { btn, watchErrors } from './helpers';

test('renomear jogador: aparece no elenco e na tática, persiste ao recarregar e pode ser restaurado', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await btn(page, /Cenários/).click();
  await btn(page, 'Escalar o time').click();
  const first = page.locator('table tbody tr').first();
  const original = (await first.locator('td').nth(1).textContent())!.replace('✎', '').trim();
  await first.getByRole('button', { name: /^Renomear / }).click();
  const input = page.getByLabel(/^Novo nome para/);
  await input.fill('Craque da Vizinhança');
  await input.press('Enter');
  await expect(page.getByText('Craque da Vizinhança').first()).toBeVisible();

  await page.reload();
  await btn(page, /Cenários/).click();
  await btn(page, 'Escalar o time').click();
  await expect(page.getByText('Craque da Vizinhança').first()).toBeVisible();

  // o nome chega também ao motor (worker): aparece nas notas do pós-jogo
  await btn(page, 'Convocação automática').click();
  await btn(page, 'Confirmar').click();
  await btn(page, 'Jogar o cenário').click();
  await btn(page, 'Simular instantâneo').click();
  await expect(page.getByText('Craque da Vizinhança').first()).toBeVisible();
  await page.goBack().catch(() => undefined);
  await page.goto('/');
  await btn(page, /Cenários/).click();
  await btn(page, 'Escalar o time').click();

  await btn(page, 'Restaurar nomes originais').click();
  await expect(page.getByText('Craque da Vizinhança')).toHaveCount(0);
  await expect(page.getByText(original).first()).toBeVisible();
  expect(errors).toEqual([]);
});
