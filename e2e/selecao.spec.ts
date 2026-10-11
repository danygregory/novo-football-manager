import { expect, test } from '@playwright/test';
import { btn, watchErrors } from './helpers';

// Seleção pronta: 872 linhas, "Escolher" desabilitado sem explicação e nenhum ponto de partida. Agora há "Clássicos", uma linha de ajuda e o
// botão diz o que vai escolher.
test('Copa completa: clássicos, ajuda e botão que diz a seleção escolhida', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await btn(page, /Copa completa/).click();
  await expect(page.getByRole('heading', { name: 'Escolha sua seleção' })).toBeVisible();
  await expect(btn(page, /^Escolher/)).toBeDisabled();
  await expect(page.getByText('Clique em uma seleção da lista ou em um clássico para escolher.')).toBeVisible();

  const classics = page.getByRole('group', { name: 'Clássicos' });
  await expect(classics.getByRole('button')).toHaveCount(4);
  await classics.getByRole('button', { name: /Hungria/ }).click();
  await expect(btn(page, /^Escolher Hungria/)).toBeEnabled();
  await expect(page.getByText('Clique em uma seleção da lista ou em um clássico para escolher.')).toHaveCount(0);

  // clicar na linha da lista também escolhe e atualiza o botão
  await page.getByLabel('Buscar').fill('Brasil');
  await page.locator('.pick-list tbody tr.clickable').first().click();
  await expect(btn(page, /^Escolher Brasil/)).toBeEnabled();

  await classics.getByRole('button', { name: /Brasil/ }).click();
  await btn(page, /^Escolher Brasil · anos 70/).click();
  await expect(page.getByRole('heading', { name: /Convocação · .*Brasil · anos 70/ })).toBeVisible();
  expect(errors).toEqual([]);
});

// Abrir a tela da Carreira (só olhar as 3 seleções) já marcava "(em andamento)" na tela inicial.
test('carreira: só fica "(em andamento)" depois de escolher a seleção', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  const card = page.locator('.mode-card', { hasText: 'Carreira de técnico' });
  await expect(card).not.toContainText('(em andamento)');
  await card.click();
  await expect(page.getByRole('heading', { name: 'Comece sua carreira' })).toBeVisible();
  await btn(page, 'Voltar').click();
  await expect(card).not.toContainText('(em andamento)'); // só olhou as opções
  await page.reload();
  await expect(card).not.toContainText('(em andamento)'); // e continua assim depois de recarregar

  await card.click();
  await btn(page, 'Treinar esta seleção').click();
  await btn(page, 'Início').first().click();
  await expect(card).toContainText('(em andamento)');
});
