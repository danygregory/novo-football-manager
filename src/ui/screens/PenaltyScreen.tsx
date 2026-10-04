import { useEffect, useRef, useState } from 'react';
import type { Dive, PenaltyInfo, PenaltyZone } from '../../engine/types';

/** Cena do pênalti em perspectiva 2D, atrás do batedor olhando para o gol (sem 3D). Coordenadas do SVG 800x450. */
export const W = 800;
export const H = 500;
const SPOT = { x: 400, y: 372 };
/** Pontos de chegada da bola por zona (centro do gol, cantos e altura). */
export const ZONE_POINT: Record<PenaltyZone, { x: number; y: number }> = {
  LH: { x: 262, y: 150 }, LL: { x: 262, y: 232 },
  CH: { x: 400, y: 150 }, CL: { x: 400, y: 232 },
  RH: { x: 538, y: 150 }, RL: { x: 538, y: 232 },
};
const KEEPER_HOME = { x: 400, y: 214 };
const DIVE_END: Record<Dive, { x: number; y: number; rot: number }> = {
  L: { x: -128, y: 12, rot: -68 },
  C: { x: 0, y: -26, rot: 0 },
  R: { x: 128, y: 12, rot: 68 },
};

export interface Timeline {
  tension: number;
  runup: number;
  flight: number;
  aftermath: number;
}

export function timeline(short: boolean): Timeline {
  return short ? { tension: 350, runup: 380, flight: 340, aftermath: 800 } : { tension: 1200, runup: 850, flight: 420, aftermath: 1100 };
}

export interface Frame {
  ball: { x: number; y: number; r: number };
  keeper: { x: number; y: number; rot: number };
  taker: { x: number; y: number; leg: number };
  /** 0..1 depois do chute: tamanho do balanço da rede. */
  net: number;
  label?: 'GOL!' | 'DEFENDEU!' | 'PRA FORA!' | 'NA TRAVE!';
  done: boolean;
}

const ease = (k: number) => k * k * (3 - 2 * k);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Posição de tudo no instante `t` (ms). Pura: dá para testar e para reproduzir. */
export function penaltyFrame(t: number, result: PenaltyInfo | undefined, short: boolean): Frame {
  const tl = timeline(short);
  const tKick = tl.tension + tl.runup;
  const sway = Math.sin(t / 170) * 30 * (t < tKick ? 1 : 0);
  const keeper = { x: KEEPER_HOME.x + sway, y: KEEPER_HOME.y, rot: 0 };
  // corrida do batedor: aproxima-se da bola em curva
  const run = clamp01((t - tl.tension) / tl.runup);
  const taker = { x: 320 + 78 * ease(run), y: 560 - 122 * ease(run), leg: run >= 1 ? clamp01((t - tKick) / 160) : 0 };
  const ball = { x: SPOT.x, y: SPOT.y, r: 13 };
  const frame: Frame = { ball, keeper, taker, net: 0, done: false };
  if (!result || t < tKick) return frame;

  const k = clamp01((t - tKick) / tl.flight);
  const target = ZONE_POINT[result.zone];
  let end = { ...target };
  let kind: Frame['label'];
  if (result.outcome === 'miss') {
    // alto: por cima do travessão; baixo: para fora, ao lado da trave
    end = result.zone.endsWith('H') ? { x: target.x + (result.zone[0] === 'L' ? -20 : result.zone[0] === 'R' ? 20 : 0), y: 62 } : { x: result.zone[0] === 'L' ? 150 : result.zone[0] === 'R' ? 650 : 560, y: 200 };
    kind = 'PRA FORA!';
  } else if (result.outcome === 'post') {
    end = result.zone[0] === 'C' ? { x: 400, y: 120 } : { x: result.zone[0] === 'L' ? 212 : 588, y: result.zone.endsWith('H') ? 124 : 200 };
    kind = 'NA TRAVE!';
  } else kind = result.outcome === 'goal' ? 'GOL!' : 'DEFENDEU!';

  // mergulho: começa junto com o chute
  const d = DIVE_END[result.dive];
  const dk = ease(clamp01((t - tKick - 40) / 320));
  keeper.x = KEEPER_HOME.x + d.x * dk + sway;
  keeper.y = KEEPER_HOME.y + d.y * dk;
  keeper.rot = d.rot * dk;

  const fly = ease(k);
  ball.x = SPOT.x + (end.x - SPOT.x) * fly;
  ball.y = SPOT.y + (end.y - SPOT.y) * fly - Math.sin(Math.PI * k) * 22;
  ball.r = 13 - 6.5 * fly;

  if (k >= 1) {
    const a = clamp01((t - tKick - tl.flight) / 420);
    if (result.outcome === 'goal') {
      frame.net = 1 - a;
      ball.y = end.y + 18 * a; // cai dentro da rede
    } else if (result.outcome === 'save') {
      // o goleiro encontra a bola quando mergulhou para o lado certo; a bola é rebatida para fora
      const caught = result.dive === result.zone[0];
      if (caught) {
        keeper.x = target.x;
        keeper.y = target.y + 8;
        ball.x = target.x + (result.zone[0] === 'R' ? 46 : result.zone[0] === 'L' ? -46 : 0) * a;
        ball.y = target.y - 40 * a;
      } else ball.y = end.y + 10 * a;
    } else if (result.outcome === 'post') {
      ball.x = end.x + (end.x < 400 ? 44 : -44) * a;
      ball.y = end.y + 62 * a;
      ball.r = 6.5 + 4 * a;
    } else {
      ball.x = end.x + (end.x < 400 ? -40 : end.x > 400 ? 40 : 0) * a;
      ball.y = end.y - 30 * a;
    }
    frame.label = kind;
  }
  frame.done = t >= tKick + tl.flight + tl.aftermath;
  return frame;
}

const ZONES: PenaltyZone[] = ['LH', 'CH', 'RH', 'LL', 'CL', 'RL'];

function Figure({ x, y, rot, color, scale, back, kicking }: { x: number; y: number; rot?: number; color: string; scale: number; back?: boolean; kicking?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot ?? 0}) scale(${scale})`}>
      <ellipse cx={0} cy={52} rx={26} ry={6} fill="rgba(0,0,0,.28)" />
      <rect x={-13} y={20} width={9} height={32} rx={4} fill="#222" />
      <rect x={4 + (kicking ?? 0) * 10} y={20 - (kicking ?? 0) * 6} width={9} height={32} rx={4} fill="#222" transform={kicking ? `rotate(${-kicking * 40} 8 20)` : undefined} />
      <rect x={-17} y={-18} width={34} height={42} rx={9} fill={color} stroke="rgba(0,0,0,.4)" />
      <rect x={-27} y={-14} width={11} height={30} rx={5} fill={color} stroke="rgba(0,0,0,.35)" transform="rotate(14 -22 -14)" />
      <rect x={16} y={-14} width={11} height={30} rx={5} fill={color} stroke="rgba(0,0,0,.35)" transform="rotate(-14 22 -14)" />
      <circle cx={0} cy={-32} r={11} fill={back ? '#5a3b26' : '#e8b894'} stroke="rgba(0,0,0,.4)" />
    </g>
  );
}

export interface PenaltySceneProps {
  takerName: string;
  keeperName: string;
  takerColor: string;
  keeperColor: string;
  /** Resultado a animar. Sem resultado, a cena fica parada (tela de escolha). */
  result?: PenaltyInfo;
  short?: boolean;
  onDone?: () => void;
  /** Escolha do canto (batedor) ou do lado do goleiro. */
  choose?: { kind: 'aim' | 'dive'; pick: (choice: string) => void };
  /** Chave que reinicia a animação (ex.: id do evento). */
  playKey?: string | number;
  skipSignal?: number;
}

export function PenaltyScene({ takerName, keeperName, takerColor, keeperColor, result, short = false, onDone, choose, playKey, skipSignal }: PenaltySceneProps) {
  const [t, setT] = useState(0);
  const doneRef = useRef(false);
  const startRef = useRef(performance.now());

  useEffect(() => {
    doneRef.current = false;
    startRef.current = performance.now();
    setT(0);
  }, [playKey, result]);

  useEffect(() => {
    let raf = 0;
    let fallback = 0;
    const tick = () => {
      const now = performance.now();
      const el = now - startRef.current;
      setT(el);
      const f = penaltyFrame(el, result, short);
      if (result && f.done && !doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // aba em segundo plano: mantém a cobrança andando
    fallback = window.setInterval(() => {
      if (performance.now() - startRef.current - t > 400) tick();
    }, 300);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, short]);

  // "pular": termina a animação logo após mostrar o resultado
  useEffect(() => {
    if (skipSignal && result && !doneRef.current) {
      const tl = timeline(short);
      startRef.current = performance.now() - (tl.tension + tl.runup + tl.flight + 150);
    }
  }, [skipSignal, result, short]);

  const f = penaltyFrame(t, result, short);
  const interactive = !!choose && !result;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pen-svg" role="img" aria-label="Cobrança de pênalti">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c1830" />
          <stop offset="1" stopColor="#1b3552" />
        </linearGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f7a45" />
          <stop offset="1" stopColor="#1f5a31" />
        </linearGradient>
      </defs>
      <rect width={W} height={260} fill="url(#sky)" />
      <rect y={250} width={W} height={H - 250} fill="url(#grass)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={0} y={250 + i * 46} width={W} height={23} fill="rgba(255,255,255,.04)" />
      ))}
      {/* arquibancada */}
      {Array.from({ length: 40 }).map((_, i) => (
        <circle key={i} cx={10 + i * 20} cy={70 + ((i * 37) % 30)} r={5} fill={`hsl(${(i * 47) % 360} 40% 45%)`} opacity={0.35} />
      ))}
      {/* rede */}
      <g transform={`translate(0 ${f.net * 6}) scale(1 ${1 + f.net * 0.04})`} style={{ transformOrigin: '400px 185px' }}>
        {Array.from({ length: 13 }).map((_, i) => (
          <line key={`v${i}`} x1={222 + i * 29.3} y1={122} x2={208 + i * 31.2} y2={252} stroke="rgba(255,255,255,.28)" />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <line key={`h${i}`} x1={222 - i * 2.3} y1={122 + i * 21.7} x2={578 + i * 2.3} y2={122 + i * 21.7} stroke="rgba(255,255,255,.28)" />
        ))}
      </g>
      {/* goleiro */}
      <Figure x={f.keeper.x} y={f.keeper.y} rot={f.keeper.rot} color={keeperColor} scale={0.78} />
      {/* trave */}
      <path d="M205 252 L222 122 L578 122 L595 252" fill="none" stroke="#fff" strokeWidth={7} strokeLinejoin="round" />
      {/* marca do pênalti e batedor */}
      <ellipse cx={SPOT.x} cy={SPOT.y + 8} rx={14} ry={4} fill="rgba(255,255,255,.7)" />
      <Figure x={f.taker.x} y={f.taker.y + 6} color={takerColor} scale={1.15} back kicking={f.taker.leg} />
      {/* bola */}
      <ellipse cx={f.ball.x} cy={Math.min(SPOT.y + 8, f.ball.y + f.ball.r + 2)} rx={f.ball.r} ry={f.ball.r / 3} fill="rgba(0,0,0,.25)" opacity={f.ball.y < SPOT.y ? 0.3 : 0.6} />
      <circle cx={f.ball.x} cy={f.ball.y} r={f.ball.r} fill="#fff" stroke="#222" strokeWidth={1.6} />
      {/* escolha */}
      {interactive && choose.kind === 'aim' &&
        ZONES.map((z) => {
          const p = ZONE_POINT[z];
          return (
            <g key={z} className="pen-zone" onClick={() => choose.pick(z)}>
              <rect x={p.x - 62} y={p.y - 42} width={124} height={80} rx={8} />
              <text x={p.x} y={p.y + 4} textAnchor="middle">{z === 'LH' || z === 'RH' ? 'canto alto' : z === 'LL' || z === 'RL' ? 'canto baixo' : z === 'CH' ? 'meio alto' : 'meio baixo'}</text>
            </g>
          );
        })}
      {interactive && choose.kind === 'dive' &&
        (['L', 'C', 'R'] as Dive[]).map((d, i) => (
          <g key={d} className="pen-zone" onClick={() => choose.pick(d)}>
            <rect x={222 + i * 119} y={122} width={118} height={130} rx={8} />
            <text x={222 + i * 119 + 59} y={192} textAnchor="middle">{d === 'L' ? 'esquerda' : d === 'R' ? 'direita' : 'ficar no meio'}</text>
          </g>
        ))}
      {/* nomes */}
      <text x={20} y={H - 14} className="pen-name">{takerName}</text>
      <text x={W - 20} y={H - 14} textAnchor="end" className="pen-name">{keeperName} (goleiro)</text>
      {f.label && (
        <text x={W / 2} y={70} textAnchor="middle" className={`pen-label ${f.label === 'GOL!' ? 'gol' : ''}`}>{f.label}</text>
      )}
    </svg>
  );
}

export type Mark = 'goal' | 'miss';

export function ShootoutBoard({ names, marks }: { names: [string, string]; marks: [Mark[], Mark[]] }) {
  return (
    <div className="so-board">
      {[0, 1].map((i) => (
        <div key={i} className="so-row">
          <span className="so-name">{names[i]}</span>
          <span className="so-marks">
            {Array.from({ length: Math.max(5, marks[i as 0 | 1].length) }).map((_, k) => {
              const m = marks[i as 0 | 1][k];
              return (
                <span key={k} className={`so-mark ${m ?? 'empty'}`} title={m === 'goal' ? 'converteu' : m === 'miss' ? 'perdeu' : 'a cobrar'}>
                  {m === 'goal' ? '●' : m === 'miss' ? '✕' : '○'}
                </span>
              );
            })}
          </span>
          <b>{marks[i as 0 | 1].filter((m) => m === 'goal').length}</b>
        </div>
      ))}
    </div>
  );
}

export function PenaltyChoice({
  kind, takerName, keeperName, takerColor, keeperColor, busy, shootout, onChoose, onAutoRest,
}: {
  kind: 'aim' | 'dive';
  takerName: string;
  keeperName: string;
  takerColor: string;
  keeperColor: string;
  busy: boolean;
  shootout: boolean;
  onChoose: (choice: string) => void;
  /** Automático nas próximas cobranças da disputa. */
  onAutoRest?: () => void;
}) {
  return (
    <div className="modal">
      <div className="panel pen-box">
        <h3>{kind === 'aim' ? '🎯 Escolha o canto da cobrança' : '🧤 Escolha o lado do goleiro'}</h3>
        <p className="muted" style={{ margin: '0 0 8px' }}>
          {kind === 'aim' ? 'Cantos altos são mais difíceis de defender, mas erram mais. O meio baixo é seguro contra goleiro que cai.' : 'Se você for para o mesmo lado da bola, pode defender; o meio só vale se ela vier no meio.'}
        </p>
        <PenaltyScene takerName={takerName} keeperName={keeperName} takerColor={takerColor} keeperColor={keeperColor} choose={{ kind, pick: (c) => !busy && onChoose(c) }} />
        <div className="row" style={{ marginTop: 10 }}>
          <button disabled={busy} onClick={() => onChoose('auto')}>Automático</button>
          {shootout && onAutoRest && (
            <button className="ghost" disabled={busy} onClick={onAutoRest}>Automático nas próximas cobranças</button>
          )}
        </div>
      </div>
    </div>
  );
}
