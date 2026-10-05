import { defineConfig } from '@playwright/test';

/**
 * Testes de ponta a ponta sobre o build de produção (assim o CSP também é exercitado).
 * Local: usa o Chrome instalado (nada para baixar). No CI: `npx playwright install --with-deps chromium`.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', channel: process.env.CI ? undefined : 'chrome', trace: 'retain-on-failure', locale: 'pt-BR' },
  webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 180_000 },
});
