import { expect, test, devices, type Page } from '@playwright/test';
import { btn } from './helpers';

// celular: 390 px de largura, toque. A página nunca pode rolar para o lado e os botões precisam ser tocáveis.
const { defaultBrowserType: _ignored, ...phone } = devices['iPhone 13'];
test.use({ ...phone });

async function noSideScroll(page: Page, where: string) {
  const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, wide: [...document.querySelectorAll('body *')].filter((e) => (e as HTMLElement).offsetWidth > 0 && e.getBoundingClientRect().right > window.innerWidth + 1 && !(e.closest('.pick-list, .table-wrap, .scroll-x'))).slice(0, 4).map((e) => `${e.tagName}.${(e as HTMLElement).className}`) }));
  expect(over.sw, `${where}: rolagem lateral (${over.wide.join(', ')})`).toBeLessThanOrEqual(over.iw + 1);
}

test('telas principais cabem na largura do celular', async ({ page }) => {
  await page.goto('/');
  await noSideScroll(page, 'início');
  await btn(page, /Cenários/).click();
  await noSideScroll(page, 'cenários');
  await btn(page, 'Escalar o time').click();
  await noSideScroll(page, 'convocação');
  await btn(page, 'Convocação automática').click();
  await btn(page, 'Confirmar').click();
  await noSideScroll(page, 'tática');
  await btn(page, 'Jogar o cenário').click();
  await noSideScroll(page, 'apresentação da partida');
  await btn(page, /Assistir \(4x\)/).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await noSideScroll(page, 'partida ao vivo');
  await page.screenshot({ path: 'test-results/mobile-live.png' });
  const canvas = await page.locator('canvas').first().boundingBox();
  expect(canvas!.width).toBeLessThanOrEqual(390);
  expect(canvas!.width).toBeGreaterThan(300);
});

test('Copa no celular: seleção, grupos e fim', async ({ page }) => {
  await page.goto('/');
  await btn(page, /Seleção pronta/).click();
  await noSideScroll(page, 'escolha da seleção');
  await page.getByLabel('Buscar').fill('Brasil');
  await page.locator('.pick-list tbody tr.clickable').first().tap();
  await btn(page, 'Escolher').tap();
  await btn(page, 'Convocação automática').tap();
  await btn(page, 'Confirmar').tap();
  await btn(page, /Escolher o recorte/).tap();
  await noSideScroll(page, 'recorte');
  await btn(page, 'Sortear a Copa').tap();
  await expect(btn(page, /Jogar partida/)).toBeVisible();
  await noSideScroll(page, 'grupos');
  const small = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetWidth > 0 && (b.getBoundingClientRect().height < 36)).length);
  expect(small, 'botões com menos de 36 px de altura').toBe(0);
});
