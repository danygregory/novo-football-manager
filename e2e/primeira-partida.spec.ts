import { expect, test } from '@playwright/test';
import { btn, watchErrors } from './helpers';

// UX da primeira partida (achados da revisão de jogabilidade): a partida precisa caber na tela, dizer qual time é o do jogador
// e chamar o cenário pelo nome, não por "Final".
test.use({ viewport: { width: 1280, height: 720 } });

test('partida ao vivo: pausar, 2x/4x e Substituir / Tática ficam visíveis sem rolar a página', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await btn(page, 'Jogar agora').click();
  await btn(page, /Assistir \(4x\)/).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  for (const name of [/Pausar|Retomar/, /^2x$/, /^4x$/, /Instantâneo/, /Substituir \/ Tática/]) {
    const box = await page.getByRole('button', { name }).first().boundingBox();
    expect(box, String(name)).not.toBeNull();
    expect(box!.y + box!.height, `${name}: o botão passa da tela de 720 px`).toBeLessThanOrEqual(720);
  }
  expect(errors).toEqual([]);
});

test('os times se identificam: VOCÊ e ADVERSÁRIO, camisas diferentes (mesmo Brasil contra Brasil) e legenda', async ({ page }) => {
  await page.goto('/');
  await btn(page, 'Jogar agora').click(); // "Brasil 70 contra Brasil de hoje"
  const kits = () => page.evaluate(() => [...document.querySelectorAll('.kit')].map((k) => (k as HTMLElement).style.background));
  // preparação
  await expect(page.getByText('VOCÊ', { exact: true })).toBeVisible();
  await expect(page.getByText('ADVERSÁRIO', { exact: true })).toBeVisible();
  const intro = await kits();
  expect(new Set(intro.slice(0, 2)).size, 'as camisas dos dois times são iguais na preparação').toBe(2);
  // ao vivo
  await btn(page, /Assistir \(4x\)/).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('VOCÊ', { exact: true })).toBeVisible();
  await expect(page.getByText('ADVERSÁRIO', { exact: true })).toBeVisible();
  const live = await page.evaluate(() => [...document.querySelectorAll('.scoreboard .kit')].map((k) => (k as HTMLElement).style.background));
  expect(new Set(live).size, 'as camisas dos dois times são iguais no placar').toBe(2);
  const legend = page.getByRole('group', { name: 'Legenda dos times' });
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('você');
  await expect(legend.locator('.kit')).toHaveCount(2);
});

test('o cenário aparece com o nome dele (não "Final") na preparação, ao vivo e no pós-jogo', async ({ page }) => {
  await page.goto('/');
  await btn(page, /Cenários/).click();
  await btn(page, 'Jogar já').click(); // O milagre de Berna
  await expect(page.getByRole('heading', { level: 2, name: 'O milagre de Berna' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Final' })).toHaveCount(0);
  await expect(page.locator('.crumbs')).toContainText('O milagre de Berna');
  await btn(page, /Assistir \(4x\)/).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 2, name: 'O milagre de Berna' })).toBeVisible();
  await btn(page, 'Instantâneo').click();
  await btn(page, 'Ver pós-jogo').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Pós-jogo · O milagre de Berna' })).toBeVisible({ timeout: 30_000 });
});
