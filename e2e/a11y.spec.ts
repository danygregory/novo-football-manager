import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { btn, startReadyCup } from './helpers';

/** Violações sérias ou críticas das regras do axe (contraste incluído) na tela atual. */
async function violations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test('telas principais sem violações sérias de acessibilidade', async ({ page }) => {
  await page.goto('/');
  expect(await violations(page), 'home').toEqual([]);
  await btn(page, /Seleção pronta/).click();
  expect(await violations(page), 'escolha da seleção').toEqual([]);
  await page.getByLabel('Buscar').fill('Brasil');
  await page.locator('.pick-list tbody tr.clickable').first().click();
  await btn(page, 'Escolher').click();
  expect(await violations(page), 'convocação').toEqual([]);
  await btn(page, 'Convocação automática').click();
  await btn(page, 'Confirmar').click();
  expect(await violations(page), 'tática').toEqual([]);
});

test('escolha da seleção e convocação funcionam só com o teclado', async ({ page }) => {
  await page.goto('/');
  await btn(page, /Seleção pronta/).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Buscar').fill('Brasil');
  const row = page.locator('.pick-list tbody tr.clickable').first();
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await btn(page, 'Escolher').focus();
  await page.keyboard.press('Enter');
  await expect(btn(page, 'Convocação automática')).toBeVisible();
  const first = page.locator('table tbody tr.clickable').first();
  const before = await first.getAttribute('aria-selected');
  await first.focus();
  await page.keyboard.press('Space');
  expect(await first.getAttribute('aria-selected')).not.toBe(before);
});

test('o foco tem indicador visível', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe('none');
});

test('Copa, partida ao vivo e painel de mudanças sem violações sérias', async ({ page }) => {
  await startReadyCup(page);
  expect(await violations(page), 'copa').toEqual([]);
  await btn(page, 'Jogar partida').click();
  expect(await violations(page), 'antes da partida').toEqual([]);
  await btn(page, /Assistir \(4x\)/).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await btn(page, /Substituir \/ Tática/).click();
  expect(await violations(page), 'ao vivo com painel de mudanças').toEqual([]);
});
