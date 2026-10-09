import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { btn, startReadyCup, watchErrors } from './helpers';

test('cenário: jogar já, resultado com pontos, compartilhar e o link do amigo abre o mesmo cenário', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await btn(page, /Cenários/).click();
  const serious = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => v.id)).toEqual([]);
  await expect(page.getByRole('heading', { name: 'O milagre de Berna' })).toBeVisible();
  await btn(page, 'Jogar já').click();
  await btn(page, 'Simular instantâneo').click();
  await btn(page, 'Continuar').click();
  await expect(page.getByRole('heading', { name: 'Pontos' })).toBeVisible();
  const text = (await page.locator('pre.share').first().textContent()) ?? '';
  expect(text).toMatch(/Cenário: O milagre de Berna/);
  const link = /(https?:\/\/\S+#c=\S+)/.exec(text)?.[1];
  expect(link).toBeTruthy();
  const [download] = await Promise.all([page.waitForEvent('download'), btn(page, 'Baixar imagem').click()]);
  expect(download.suggestedFilename()).toBe('novo-fm-milagre-berna.png');

  const friend = await context.newPage();
  await friend.goto(link!);
  await expect(friend.getByRole('heading', { name: 'Desafio de um amigo' })).toBeVisible();
  await expect(friend.getByText(/amigo: \d+ pts/)).toBeVisible();
  await expect(friend.getByRole('heading', { name: 'Maracanazo' })).toHaveCount(0);
  await friend.getByRole('button', { name: 'Ver todos os cenários' }).click();
  await expect(friend.getByRole('heading', { name: 'Maracanazo' })).toBeVisible();

  // o melhor resultado fica salvo
  await page.reload();
  await btn(page, /Cenários/).click();
  await expect(page.getByText(/seu melhor: \d+ pts/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('cenário ao vivo com escalação própria: Escalar o time leva a convocação e à tática', async ({ page }) => {
  await page.goto('/');
  await btn(page, /Cenários/).click();
  await btn(page, 'Escalar o time').click();
  await btn(page, 'Convocação automática').click();
  await btn(page, 'Confirmar').click();
  await btn(page, 'Jogar o cenário').click();
  await expect(btn(page, /Assistir \(2x\)/)).toBeVisible();
});

// Regression: ISSUE-005 — só existe um slot de partida em andamento; iniciar um cenário apagava a Copa salva sem avisar
// Found by /qa on 2026-10-09
test('Copa em andamento: iniciar um cenário avisa antes de descartá-la e, se cancelar, a Copa continua salva', async ({ page }) => {
  const errors = watchErrors(page);
  const messages: string[] = [];
  let accept = false;
  page.on('dialog', (d) => {
    messages.push(d.message());
    void (accept ? d.accept() : d.dismiss());
  });
  await startReadyCup(page);
  await page.goto('/');
  await expect(page.getByText(/Continuar: Brasil/)).toBeVisible();

  // cancelar: o aviso aparece, o cenário não começa e a Copa segue salva
  await btn(page, /Cenários/).click();
  await btn(page, 'Jogar já').click();
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toMatch(/partida em andamento: Brasil/);
  await expect(page.getByRole('heading', { name: 'Cenários' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText(/Continuar: Brasil/)).toBeVisible();

  // aceitar: o cenário começa e passa a ser a partida salva
  accept = true;
  await btn(page, /Cenários/).click();
  await btn(page, 'Jogar já').click();
  await expect(btn(page, /Assistir \(2x\)/)).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Continuar: O milagre de Berna')).toBeVisible();
  expect(errors).toEqual([]);
});
