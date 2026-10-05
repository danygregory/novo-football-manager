/**
 * Gera as imagens estáticas do site (pré-visualização de links e ícones) a partir de HTML, com o Chrome do sistema.
 * Uso: npm run make-assets   (os PNGs ficam em public/ e são versionados)
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = `font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; margin:0; color:#e8f1ea;`;

const og = `<body style="${BASE} width:1200px;height:630px;background:linear-gradient(160deg,#0e1a14,#15261d 60%,#1c3226);position:relative;overflow:hidden">
  <div style="position:absolute;left:0;top:0;width:600px;height:14px;background:#c8102e"></div><div style="position:absolute;left:600px;top:0;width:600px;height:14px;background:#f2c744"></div>
  <svg style="position:absolute;right:-60px;top:70px;opacity:.28" width="560" height="420" viewBox="0 0 560 420"><rect x="10" y="10" width="540" height="400" rx="14" fill="none" stroke="#fff" stroke-width="4"/><line x1="280" y1="10" x2="280" y2="410" stroke="#fff" stroke-width="4"/><circle cx="280" cy="210" r="60" fill="none" stroke="#fff" stroke-width="4"/><rect x="10" y="120" width="110" height="180" fill="none" stroke="#fff" stroke-width="4"/><rect x="440" y="120" width="110" height="180" fill="none" stroke="#fff" stroke-width="4"/></svg>
  <div style="padding:90px 80px 0">
    <div style="font-size:30px;letter-spacing:.2em;color:#f2c744;font-weight:700">NOVO FOOTBALL MANAGER</div>
    <div style="font-size:78px;font-weight:800;line-height:1.05;margin-top:26px;max-width:800px">A Hungria de 1954 contra o Brasil de hoje.</div>
    <div style="font-size:34px;color:#94ad9d;margin-top:28px;max-width:760px">Seleções históricas de verdade, jogadores fictícios. Monte, escale e decida a partida.</div>
    <div style="display:flex;gap:16px;margin-top:44px;font-size:26px;font-weight:600">
      <span style="border:2px solid #2a4636;border-radius:999px;padding:8px 22px">841 seleções-era</span>
      <span style="border:2px solid #2a4636;border-radius:999px;padding:8px 22px">cenários de uma partida</span>
      <span style="border:2px solid #2a4636;border-radius:999px;padding:8px 22px">desafio do dia</span>
    </div>
  </div></body>`;

const icon = (px: number) => `<body style="margin:0;width:${px}px;height:${px}px;background:#0e1a14;display:grid;place-items:center">
  <svg width="${px * 0.82}" height="${px * 0.82}" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="#3ddc84" stroke-width="2.4"/><path d="M16 9.5l5 3.7-1.9 5.8h-6.2L11 13.2z" fill="#3ddc84"/></svg></body>`;

mkdirSync('public', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const shot = async (html: string, w: number, h: number, path: string) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html);
  await page.screenshot({ path });
  await page.close();
  console.log('gerado', path);
};
await shot(og, 1200, 630, 'public/og.png');
await shot(icon(512), 512, 512, 'public/icon-512.png');
await shot(icon(192), 192, 192, 'public/icon-192.png');
await shot(icon(180), 180, 180, 'public/apple-touch-icon.png');
await browser.close();
