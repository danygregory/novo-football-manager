import { expect, test } from '@playwright/test';
import { btn, watchErrors } from './helpers';

// Regressão: o draft escondia a coluna GOL de todos os jogadores (filtro explícito em DraftBoard), então o atributo que define a nota de um
// goleiro ficava invisível: goleiros com DEF/PAS/DRI bem diferentes apareciam com a mesma nota geral sem nenhuma explicação na tela.
test('draft: a tabela mostra GOL, que é o destaque dos goleiros (nos demais fica esmaecido)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByText('Mais modos', { exact: true }).click();
  await btn(page, /Monte a sua/).click();
  await btn(page, 'Começar o draft').click();
  await expect(page.getByRole('heading', { level: 2, name: /Draft/ })).toBeVisible();

  const headers = await page.locator('.draft-list thead th').allInnerTexts();
  expect(headers.map((h) => h.trim())).toEqual(['POS', 'NOME', 'IDADE', 'DEF', 'PAS', 'DRI', 'FIN', 'FÍS', 'VEL', 'GOL', 'GER']);

  // GOL e GER precisam caber no painel em qualquer fonte. A largura "natural" (mínima) da tabela muda com a fonte do sistema: no Linux do CI
  // ela chegou a ser 11% maior que no Mac, e GOL e GER voltaram a ficar cortados. Exigir folga (85% do painel) cobre fontes até ~17% mais largas.
  const fit = await page.locator('.draft-list').evaluate((el) => {
    const t = el.querySelector('table') as HTMLElement;
    const before = t.style.width;
    t.style.width = 'min-content';
    const natural = t.getBoundingClientRect().width;
    t.style.width = before;
    return { natural, painel: el.clientWidth, rolagem: el.scrollWidth > el.clientWidth + 1 };
  });
  expect(fit.rolagem, 'a tabela do draft ganhou rolagem lateral').toBe(false);
  expect(fit.natural, `largura mínima ${Math.round(fit.natural)} px num painel de ${fit.painel} px: sem folga para fontes mais largas`).toBeLessThanOrEqual(fit.painel * 0.85);

  await page.locator('.tabs').getByRole('button', { name: 'Goleiros' }).click();
  await expect(page.locator('.draft-list tbody tr').first().locator('.sub'), 'o estilo do jogador continua visível, embaixo do nome').toContainText('goleiro');
  const gk = await page.locator('.draft-list tbody tr').evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll('td.num')].map((c) => Number(c.textContent))));
  expect(gk.length).toBeGreaterThan(0);
  for (const [age, def, pas, dri, fin, fis, vel, gol, ger] of gk) {
    expect(Number.isFinite(gol), 'GOL numérico').toBe(true);
    // 5% dos goleiros têm um atributo de linha acima do GOL, então "o maior" não vale; a média dos outros seis vale para os 3.488 gerados
    const others = (def! + pas! + dri! + fin! + fis! + vel!) / 6;
    expect(gol!, `goleiro de ${age} anos: o GOL (${gol}) fica acima da média dos outros atributos (${others.toFixed(1)})`).toBeGreaterThan(others);
    expect(ger!).toBeGreaterThan(0);
  }

  await page.locator('.tabs').getByRole('button', { name: 'Atacantes' }).click();
  const muted = await page.locator('.draft-list tbody tr').first().locator('td.num').nth(7).evaluate((c) => getComputedStyle(c).color);
  const normal = await page.locator('.draft-list tbody tr').first().locator('td.num').nth(3).evaluate((c) => getComputedStyle(c).color);
  expect(muted, 'o GOL de quem não é goleiro fica esmaecido').not.toBe(normal);
  expect(errors).toEqual([]);
});
