import { expect, type Page } from '@playwright/test';

/** Coleta erros de console e exceções da página; o teste confere no fim que não houve nenhum. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

export const btn = (page: Page, name: string | RegExp) => page.getByRole('button', { name }).first();

/** Seleção pronta: escolhe a seleção (pela busca), convoca, escala e sorteia a Copa. */
export async function startReadyCup(page: Page, query = 'Brasil') {
  await page.goto('/');
  await btn(page, /Seleção pronta/).click();
  await page.getByLabel('Buscar').fill(query);
  await page.locator('.pick-list tbody tr.clickable').first().click();
  await btn(page, 'Escolher').click();
  await btn(page, 'Convocação automática').click();
  await btn(page, 'Confirmar').click();
  await btn(page, /Escolher o recorte/).click();
  await btn(page, 'Sortear a Copa').click();
  await expect(btn(page, /Jogar partida/)).toBeVisible();
}

/** Joga tudo no instantâneo até aparecer a tela final. */
export async function finishCupInstantly(page: Page) {
  for (let i = 0; i < 80; i++) {
    if (await btn(page, 'Nova Copa').isVisible()) return;
    for (const name of ['Ver campeão e prêmios', 'Continuar', 'Simular instantâneo', 'Simular até o fim', 'Jogar partida']) {
      // a tela troca rápido: um clique que não achou o botão não é erro, tenta de novo no próximo ciclo
      const ok = await btn(page, name).click({ timeout: 300 }).then(() => true, () => false);
      if (ok) break;
    }
    await page.waitForTimeout(60);
  }
  await expect(btn(page, 'Nova Copa')).toBeVisible();
}
