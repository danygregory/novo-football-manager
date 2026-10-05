import { expect, test } from '@playwright/test';
import { btn, startReadyCup, watchErrors } from './helpers';

test('Copa em andamento: salva a cada rodada, continua depois de recarregar e some ao terminar', async ({ page }) => {
  const errors = watchErrors(page);
  page.on('dialog', (d) => void d.accept());
  await startReadyCup(page);
  await btn(page, 'Jogar partida').click();
  await btn(page, 'Simular instantâneo').click();
  await btn(page, 'Continuar').click();
  await expect(page.getByText(/Fase de grupos · 2ª rodada/).first()).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Continuar: Brasil/)).toBeVisible();
  await btn(page, /^Continuar$/).click();
  await expect(page.getByText(/Fase de grupos · 2ª rodada/).first()).toBeVisible();
  await expect(btn(page, 'Jogar partida')).toBeVisible();

  // joga o resto no instantâneo: ao terminar, a Copa salva desaparece (o resultado virou ranking)
  for (let i = 0; i < 80 && !(await btn(page, 'Nova Copa').isVisible()); i++) {
    for (const n of ['Ver campeão e prêmios', 'Continuar', 'Simular instantâneo', 'Simular até o fim', 'Jogar partida']) {
      if (await btn(page, n).click({ timeout: 300 }).then(() => true, () => false)) break;
    }
    await page.waitForTimeout(60);
  }
  await expect(btn(page, 'Nova Copa')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('novo-fm-run'))).toBeNull();
  await page.reload();
  await expect(page.getByText(/Continuar: /)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('cenário salvo continua na apresentação da partida', async ({ page }) => {
  await page.goto('/');
  await btn(page, /Cenários/).click();
  await btn(page, 'Jogar já').click();
  await expect(btn(page, /Assistir \(2x\)/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Continuar: O milagre de Berna/)).toBeVisible();
  await btn(page, /^Continuar$/).click();
  await expect(btn(page, /Assistir \(2x\)/)).toBeVisible();
});

test('exportar e importar: o progresso volta em um navegador limpo; arquivo inválido é recusado', async ({ page, browser }, info) => {
  const errors = watchErrors(page);
  page.on('dialog', (d) => void d.accept());
  await startReadyCup(page);
  await btn(page, 'Jogar partida').click();
  await btn(page, 'Simular instantâneo').click();
  await btn(page, 'Continuar').click();
  await btn(page, 'Início').click();
  const [download] = await Promise.all([page.waitForEvent('download'), btn(page, 'Exportar save').click()]);
  const path = info.outputPath('save.json');
  await download.saveAs(path);

  const ctx = await browser.newContext();
  const fresh = await ctx.newPage();
  fresh.on('dialog', (d) => void d.accept());
  const fErrors = watchErrors(fresh);
  await fresh.goto('/');
  await expect(fresh.getByText(/Continuar: /)).toHaveCount(0);
  await fresh.getByLabel('Arquivo de save').setInputFiles(path);
  await expect(fresh.getByText('Save importado.')).toBeVisible();
  await expect(fresh.getByText(/Continuar: Brasil/)).toBeVisible();
  await btn(fresh, /^Continuar$/).click();
  await expect(fresh.getByText(/Fase de grupos · 2ª rodada/).first()).toBeVisible();

  await fresh.goto('/');
  await fresh.getByLabel('Arquivo de save').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"outro"}') });
  await expect(fresh.getByText(/não é um save/)).toBeVisible();
  await fresh.getByLabel('Arquivo de save').setInputFiles({ name: 'y.json', mimeType: 'application/json', buffer: Buffer.from('nao é json') });
  await expect(fresh.getByText(/JSON válido/)).toBeVisible();
  expect(errors).toEqual([]);
  expect(fErrors).toEqual([]);
  await ctx.close();
});
