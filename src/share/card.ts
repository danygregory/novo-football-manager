/** Cartão de resultado em imagem (PNG 1080x1350), desenhado no navegador. Sem nomes de jogadores e sem dados pessoais. */
export interface CardData {
  /** Linha do modo: "Desafio do dia · 2026-10-05", "Cenário · Maracanazo", "Copa". */
  mode: string;
  team: string;
  era: string;
  colors: { primary: string; secondary: string };
  /** Resultado em destaque: "Semifinais", "Campeã". */
  headline: string;
  champion: boolean;
  /** "4V 0E 2D · 11–6 gols" */
  record: string;
  points: number;
  /** Chamada no rodapé e endereço do jogo. */
  cta: string;
  url: string;
}

const W = 1080;
const H = 1350;
const FONT = `system-ui, -apple-system, 'Segoe UI', sans-serif`;
const HEX = /^#[0-9a-fA-F]{6}$/;

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, weight = 700): number {
  let px = startPx;
  do {
    ctx.font = `${weight} ${px}px ${FONT}`;
    px -= 4;
  } while (ctx.measureText(text).width > maxWidth && px > 24);
  return px + 4;
}

export function drawCard(ctx: CanvasRenderingContext2D, d: CardData): void {
  const c1 = HEX.test(d.colors.primary) ? d.colors.primary : '#2f7a45';
  const c2 = HEX.test(d.colors.secondary) ? d.colors.secondary : '#f2c744';
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0e1a14');
  bg.addColorStop(1, '#15261d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // faixa com as cores da seleção
  ctx.fillStyle = c1;
  ctx.fillRect(0, 0, W / 2, 18);
  ctx.fillStyle = c2;
  ctx.fillRect(W / 2, 0, W / 2, 18);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2c744';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText('NOVO FOOTBALL MANAGER', W / 2, 110);
  ctx.fillStyle = '#94ad9d';
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(d.mode, W / 2, 168);

  // camisa
  const kit = ctx.createLinearGradient(W / 2 - 90, 0, W / 2 + 90, 0);
  kit.addColorStop(0, c1);
  kit.addColorStop(0.5, c1);
  kit.addColorStop(0.5, c2);
  kit.addColorStop(1, c2);
  ctx.fillStyle = kit;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 90, 230, 180, 120, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#e8f1ea';
  const tp = fitText(ctx, d.team, W - 140, 92);
  ctx.font = `700 ${tp}px ${FONT}`;
  ctx.fillText(d.team, W / 2, 470);
  ctx.fillStyle = '#94ad9d';
  ctx.font = `500 44px ${FONT}`;
  ctx.fillText(d.era, W / 2, 535);

  // resultado
  ctx.fillStyle = d.champion ? '#f2c744' : '#e8f1ea';
  const head = d.champion ? `🏆 ${d.headline}` : d.headline;
  const hp = fitText(ctx, head, W - 140, 104);
  ctx.font = `800 ${hp}px ${FONT}`;
  ctx.fillText(head, W / 2, 720);
  ctx.fillStyle = '#94ad9d';
  ctx.font = `500 42px ${FONT}`;
  ctx.fillText(d.record, W / 2, 790);

  // pontos
  ctx.fillStyle = '#f2c744';
  ctx.font = `800 220px ${FONT}`;
  ctx.fillText(String(d.points), W / 2, 1040);
  ctx.fillStyle = '#94ad9d';
  ctx.font = `600 40px ${FONT}`;
  ctx.fillText('PONTOS', W / 2, 1095);

  // rodapé
  ctx.fillStyle = '#e8f1ea';
  const cp = fitText(ctx, d.cta, W - 140, 48, 600);
  ctx.font = `600 ${cp}px ${FONT}`;
  ctx.fillText(d.cta, W / 2, 1210);
  ctx.fillStyle = '#94ad9d';
  const up = fitText(ctx, d.url, W - 140, 34, 500);
  ctx.font = `500 ${up}px ${FONT}`;
  ctx.fillText(d.url, W / 2, 1265);
  ctx.fillStyle = '#6f8a79';
  ctx.font = `400 26px ${FONT}`;
  ctx.fillText('Seleções históricas reais, jogadores fictícios. Sem rede, sem cadastro.', W / 2, 1310);
}

export function renderCard(d: CardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas indisponível'));
  drawCard(ctx, d);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), 'image/png'));
}
