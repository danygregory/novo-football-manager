import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { btn, watchErrors } from './helpers';

test('primeira visita: um toque leva a uma partida, com a dica de como jogar uma vez só', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByText('Comece por aqui · uma partida')).toBeVisible();
  const serious = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => v.id)).toEqual([]);
  await expect(page.getByText('Brasil · anos 70')).toBeVisible(); // primeiro gancho da fila
  await btn(page, 'Jogar agora').click();
  await btn(page, /Assistir \(2x\)/).click();
  await expect(page.getByText('Como jogar:')).toBeVisible({ timeout: 30_000 });
  await btn(page, 'Entendi').click();
  await expect(page.getByText('Como jogar:')).toHaveCount(0);
  await page.reload();
  await btn(page, /^Continuar$/).click(); // a partida em andamento (cenário) continua
  await btn(page, /Assistir \(2x\)/).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Como jogar:')).toHaveCount(0);
  expect(errors).toEqual([]);
});
