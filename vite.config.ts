import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy do build de produção (o servidor de desenvolvimento precisa de WebSocket e de scripts inline do
 * recarregamento automático, então fica sem). Tudo roda no navegador e só da própria origem: sem rede, sem frames, sem plugins.
 * 'unsafe-inline' em style é necessário porque o React e o SVG usam atributos style; scripts não têm inline nem eval
 * (o Pixi usa o módulo pixi.js/unsafe-eval justamente para dispensar o eval).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'novo-fm-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
  ],
});

export default defineConfig({
  // caminhos relativos: o build funciona na raiz de um domínio e em subpasta (GitHub Pages)
  base: './',
  plugins: [react(), cspPlugin()],
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'], environment: 'node' },
});
