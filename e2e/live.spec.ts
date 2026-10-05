import { expect, test } from '@playwright/test';
import { btn, startReadyCup, watchErrors } from './helpers';

test('partida ao vivo: assiste a 4x, abre a pausa de tática, retoma e termina no pós-jogo', async ({ page }) => {
  const errors = watchErrors(page);
  await startReadyCup(page);
  await btn(page, 'Jogar partida').click();
  await btn(page, /Assistir \(4x\)/).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await btn(page, /Substituir \/ Tática/).click();
  await btn(page, 'Retomar jogo').click();
  // o relógio anda: deixa o jogo andar alguns segundos e então termina no instantâneo (a partida ao vivo inteira levaria minutos)
  await page.waitForTimeout(4000);
  await btn(page, /Instantâneo/).click();
  await btn(page, 'Ver pós-jogo').click({ timeout: 30_000 });
  await expect(btn(page, 'Continuar')).toBeVisible();
  expect(errors).toEqual([]);
});
