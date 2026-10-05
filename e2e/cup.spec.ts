import { expect, test } from '@playwright/test';
import { btn, finishCupInstantly, startReadyCup, watchErrors } from './helpers';

test('Seleção pronta: Copa inteira no instantâneo, sem erros, e o ranking registra a campanha', async ({ page }) => {
  const errors = watchErrors(page);
  page.on('dialog', (d) => void d.accept());
  await startReadyCup(page);
  await finishCupInstantly(page);
  await expect(page.getByText(/pontos/i).first()).toBeVisible();
  await btn(page, 'Início').click();
  await btn(page, /Conquistas e ranking/).click();
  await expect(page.getByText(/Brasil/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('o save local sobrevive a recarregar a página', async ({ page }) => {
  await startReadyCup(page);
  await finishCupInstantly(page);
  const stats = await page.evaluate(() => localStorage.getItem('novo-fm-stats'));
  expect(JSON.parse(stats ?? '{}').cups).toBe(1);
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem('novo-fm-stats'))).toBe(stats);
});
