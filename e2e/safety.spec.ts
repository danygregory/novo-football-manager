import { expect, test } from '@playwright/test';
import { btn, watchErrors } from './helpers';

test('save adulterado no localStorage não derruba o jogo', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem('novo-fm-career', '{"id":1,"entries":"x"}');
    localStorage.setItem('novo-fm-ranking', '[{"mode":"hack"}]');
    localStorage.setItem('novo-fm-achievements', '{"__proto__":"x"}');
    localStorage.setItem('novo-fm-settings', 'nao e json');
  });
  await page.goto('/');
  await expect(btn(page, /Seleção pronta/)).toBeVisible();
  await expect(btn(page, /Carreira de técnico(?! \(em andamento)/)).toBeVisible(); // sem "(em andamento)": o save inválido foi ignorado
  await btn(page, /Conquistas e ranking/).click();
  await expect(page.getByRole('heading').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('CSP do build bloqueia script injetado e a página tem a meta de CSP', async ({ page }) => {
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  const ran = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__pwned = true';
    document.head.appendChild(s);
    return (window as unknown as { __pwned?: boolean }).__pwned === true;
  });
  expect(ran).toBe(false);
});
