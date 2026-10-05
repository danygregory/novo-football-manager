import { expect, test } from '@playwright/test';
import { btn, finishCupInstantly, startReadyCup, watchErrors } from './helpers';

test('fim da Copa: cartão em imagem, texto com link e o link reabre a mesma Copa', async ({ page, context }) => {
  const errors = watchErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await startReadyCup(page);
  await finishCupInstantly(page);

  // imagem PNG válida e do tamanho certo
  const [download] = await Promise.all([page.waitForEvent('download'), btn(page, 'Baixar imagem').click()]);
  expect(download.suggestedFilename()).toMatch(/^novo-fm-.*\.png$/);
  const dim = (await page.locator('pre.share').first().textContent()) ?? '';
  expect(dim).toMatch(/NOVO Football Manager · Copa/);
  expect(dim).toMatch(/\d+ pts/);
  expect(dim).not.toMatch(/Joaquín|Olineardo/); // nenhum nome de jogador

  const text = (await page.locator('pre.share').first().textContent()) ?? '';
  const link = /(https?:\/\/\S+#c=\S+)/.exec(text)?.[1];
  expect(link).toBeTruthy();

  // quem abre o link cai na tela do desafio, com a mesma seleção
  const friend = await context.newPage();
  const fErrors = watchErrors(friend);
  await friend.goto(link!);
  await expect(friend.getByRole('heading', { name: 'Desafio de um amigo' })).toBeVisible();
  await expect(friend.getByText(/Ele fez/)).toBeVisible();
  expect(new URL(friend.url()).hash).toBe(''); // hash limpo: recarregar não reabre
  await friend.getByRole('button', { name: 'Aceitar o desafio' }).click();
  await friend.getByRole('button', { name: 'Convocação automática' }).click();
  await friend.getByRole('button', { name: 'Confirmar' }).click();
  await friend.getByRole('button', { name: /Iniciar a Copa|Escolher o recorte|Sortear/ }).first().click();
  await expect(friend.getByRole('button', { name: 'Jogar partida' })).toBeVisible();
  expect(fErrors).toEqual([]);
  expect(errors).toEqual([]);
});

test('link de desafio inválido é ignorado sem erro', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#c=' + encodeURIComponent('k=cup&n=../../etc&u=all&s=1'));
  await expect(btn(page, /Seleção pronta/)).toBeVisible();
  await page.goto('/#c=%E0%A4%A');
  await expect(btn(page, /Seleção pronta/)).toBeVisible();
  expect(errors).toEqual([]);
});
