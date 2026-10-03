import { useEffect, useMemo, useRef, useState } from 'react';
import { FORMATIONS } from '../../engine/formations';
import { overall } from '../../engine/player';
import type { LiveState } from '../../engine/match';
import { STAGE_LABEL, type Fixture } from '../../engine/tournament';
import type { MatchEvent, MatchReport, Tactics } from '../../engine/types';
import type { MatchRecord } from '../../engine/tournament';
import type { MatchDelta } from '../../engine/worker';
import { Bar, NationName, PosPill } from '../components/common';
import { engine } from '../engineClient';
import { PitchView } from '../pitch/PitchView';
import { ballPosition, layoutSide } from '../pitch/layout';
import { nationsById, playerById } from '../world';

export interface LiveStart extends MatchDelta {
  fixture: Fixture;
  userSide: 0 | 1;
}

/** Segundos reais por minuto de jogo. */
const SEC_PER_MIN = { 1: 1.5, 4: 0.375 } as const;
type Speed = keyof typeof SEC_PER_MIN;

const FEED_TYPES = new Set<MatchEvent['type']>(['kickoff', 'goal', 'save', 'hard-save', 'miss', 'big-miss', 'post', 'offside', 'foul', 'yellow', 'red', 'sub', 'tactic', 'halftime', 'fulltime', 'penalty-shootout']);
const ICON: Partial<Record<MatchEvent['type'], string>> = { goal: '⚽', save: '🧤', 'hard-save': '🧤', miss: '💨', 'big-miss': '😱', post: '🥅', offside: '🚩', foul: '🦶', yellow: '🟨', red: '🟥', sub: '🔁', halftime: '⏸', fulltime: '🏁', 'penalty-shootout': '🎯', tactic: '📋', kickoff: '▶' };

const lastName = (name: string) => name.split(' ').slice(-1)[0] ?? name;
const jitter = (n: number) => ((Math.imul(n + 1, 2654435761) >>> 0) % 1000) / 1000;

function luminanceDistance(a: string, b: string): number {
  const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(a) as [number, number, number];
  const [r2, g2, b2] = rgb(b) as [number, number, number];
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

interface Model {
  displayClock: number;
  simClock: number;
  simFinished: boolean;
  fetching: boolean;
  paused: boolean;
  speed: Speed;
  buffer: MatchEvent[];
  feed: MatchEvent[];
  score: [number, number];
  shootout: [number, number];
  ticker: string;
  flash?: string;
  state: LiveState;
  report?: MatchReport;
  record?: MatchRecord;
  shownEnd: boolean;
  lastKickAt: number;
  eventCount: number;
  halftimeBanner: boolean;
}

export function LiveMatch({ start, speed0, onFinished, onBack }: { start: LiveStart; speed0: Speed; onFinished: (report: MatchReport, record: MatchRecord) => void; onBack: () => void }) {
  const { fixture, userSide } = start;
  const nations = [nationsById.get(fixture.home)!, nationsById.get(fixture.away)!] as const;
  const mine = nations[userSide];
  const colors = useMemo(() => {
    const c0 = nations[0].colors.primary;
    let c1 = nations[1].colors.primary;
    if (luminanceDistance(c0, c1) < 90) c1 = nations[1].colors.secondary;
    if (luminanceDistance(c0, c1) < 90) c1 = '#3b82d6';
    return [c0, c1] as const;
  }, [nations]);

  const host = useRef<HTMLDivElement>(null);
  const pitch = useRef<PitchView | undefined>(undefined);
  const feedEl = useRef<HTMLUListElement>(null);
  const model = useRef<Model>({
    displayClock: 0,
    simClock: start.state.clock,
    simFinished: start.state.finished,
    fetching: false,
    paused: false,
    speed: speed0,
    buffer: [...start.events],
    feed: [],
    score: [0, 0],
    shootout: [0, 0],
    ticker: 'Bola rolando…',
    state: start.state,
    shownEnd: false,
    lastKickAt: 0,
    eventCount: 0,
    halftimeBanner: false,
  });
  const [, bump] = useState(0);
  const [panel, setPanel] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const render = () => bump((n) => n + 1);

  const ballRef = useRef({ team: 0 as 0 | 1, zone: 'MID' as const, x: 0.5 });

  const updatePitch = () => {
    const pv = pitch.current;
    if (!pv) return;
    const m = model.current;
    const b = ballRef.current;
    const players: Parameters<PitchView['setPlayers']>[0] = [];
    ([0, 1] as const).forEach((side) => {
      const lay = layoutSide(m.state.sides[side].onPitch, side, b.x);
      for (const p of m.state.sides[side].onPitch) {
        const pos = lay.get(p.id);
        if (!pos) continue;
        players.push({ id: p.id, label: lastName(playerById(p.id)?.name ?? p.id), x: pos.x, y: pos.y, color: colors[side], border: side === userSide ? '#f2c744' : '#ffffff', keeper: p.slot === 'GK' });
      }
    });
    pv.setPlayers(players);
  };

  const moveBall = (team: 0 | 1, zone: MatchEvent['zone']) => {
    const m = model.current;
    const pos = ballPosition(team, zone, jitter(m.eventCount++));
    ballRef.current = { team, zone: zone === 'BOX' ? 'MID' : (zone as 'MID'), x: pos.x };
    pitch.current?.setBall(pos.x, pos.y);
  };

  const consume = (ev: MatchEvent) => {
    const m = model.current;
    if (ev.type === 'goal') {
      m.score[ev.team]++;
      m.flash = `GOL! ${playerById(ev.playerId ?? '')?.name ?? ''} (${nationsById.get(ev.team === 0 ? fixture.home : fixture.away)?.country})`;
      setTimeout(() => {
        if (model.current.flash?.startsWith('GOL!')) {
          model.current.flash = undefined;
          render();
        }
      }, 2600);
    }
    if (ev.type === 'penalty-shootout' && ev.scored) m.shootout[ev.team]++;
    if (ev.type === 'advance' || ev.type === 'possession-change') {
      m.ticker = ev.text;
      moveBall(ev.team, ev.zone);
    } else if (ev.type === 'goal' || ev.type === 'save' || ev.type === 'hard-save' || ev.type === 'miss' || ev.type === 'big-miss' || ev.type === 'post') {
      moveBall(ev.team, 'BOX');
    }
    if (FEED_TYPES.has(ev.type)) m.feed = [ev, ...m.feed].slice(0, 80);
    if (ev.type === 'halftime') {
      m.paused = true;
      m.halftimeBanner = true;
    }
  };

  /** Consome do buffer tudo que já aconteceu no relógio (ou tudo, com `all`). */
  const drain = (all = false) => {
    const m = model.current;
    while (m.buffer.length) {
      const ev = m.buffer[0] as MatchEvent;
      if (!all && (ev.t ?? 0) > m.displayClock) break;
      if (!all && ev.type === 'penalty-shootout') {
        const gap = m.speed === 1 ? 1100 : 350;
        if (performance.now() - m.lastKickAt < gap) break;
        m.lastKickAt = performance.now();
      }
      m.buffer.shift();
      consume(ev);
      if (m.paused && ev.type === 'halftime' && !all) break;
    }
  };

  const absorb = (d: MatchDelta) => {
    const m = model.current;
    m.buffer.push(...d.events);
    m.state = d.state;
    m.simClock = d.state.clock;
    if (d.state.finished) m.simFinished = true;
    if (d.report) m.report = d.report;
    if (d.record) m.record = d.record;
  };

  const fetchMore = async (until: number) => {
    const m = model.current;
    m.fetching = true;
    try {
      absorb(await engine.call('matchAdvance', { until }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      m.paused = true;
    } finally {
      m.fetching = false;
    }
  };

  // campo Pixi
  useEffect(() => {
    const pv = new PitchView(host.current as HTMLElement);
    pitch.current = pv;
    let cancelled = false;
    void pv.init().then(() => {
      if (cancelled) return;
      drain(true);
      updatePitch();
      pv.setBall(0.5, 0.5);
      render();
    });
    return () => {
      cancelled = true;
      pv.destroy();
      pitch.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // laço de reprodução
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastRender = 0;
    const frame = (now: number) => {
      const dt = Math.min(now - last, 250);
      last = now;
      const m = model.current;
      if (!m.paused && !(m.simFinished && m.buffer.length === 0 && m.displayClock >= m.simClock)) {
        m.displayClock += dt / 1000 / SEC_PER_MIN[m.speed];
      }
      if (!m.paused && !m.fetching && !m.simFinished && m.simClock < m.displayClock + 0.5) void fetchMore(m.displayClock + 1);
      const before = m.buffer.length;
      drain();
      if (m.simFinished && m.buffer.length === 0 && !m.shownEnd && m.displayClock >= m.simClock) m.shownEnd = true;
      if (before !== m.buffer.length) updatePitch();
      if (now - lastRender > 100) {
        lastRender = now;
        render();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // novas jogadas rolam o feed para o topo
  const m = model.current;
  useEffect(() => {
    if (feedEl.current) feedEl.current.scrollTop = 0;
  }, [m.feed.length]);

  const call = async (fn: () => Promise<MatchDelta>) => {
    setBusy(true);
    setError(undefined);
    try {
      absorb(await fn());
      drain(true);
      m.displayClock = Math.max(m.displayClock, m.simClock);
      updatePitch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      render();
    }
  };

  const togglePause = () => {
    m.paused = !m.paused;
    m.halftimeBanner = false;
    render();
  };

  const openPanel = () => {
    m.paused = true;
    // alinha o relógio visível com o da simulação antes de decidir
    drain(true);
    m.displayClock = Math.max(m.displayClock, m.simClock);
    updatePitch();
    setPanel(true);
  };

  const closePanel = () => {
    setPanel(false);
    m.halftimeBanner = false;
    m.paused = false;
    render();
  };

  const instant = () =>
    call(async () => {
      const d = await engine.call('matchFinish', {});
      m.paused = false;
      return d;
    });

  const done = m.shownEnd && m.report !== undefined;
  const minute = Math.min(Math.floor(m.displayClock) + 1, m.state.extraTime ? 120 : 90);
  const side = m.state.sides[userSide];
  const knockoutShootout = m.shootout[0] + m.shootout[1] > 0 || m.feed.some((e) => e.type === 'penalty-shootout');

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div>
          <h2 style={{ marginBottom: 0 }}>{STAGE_LABEL[fixture.stage]}</h2>
          <div className="muted">Campo neutro · você é {mine.country}</div>
        </div>
        <button className="ghost" onClick={onBack} title="Abandona a visualização (a partida será simulada)">Sair</button>
      </div>

      <div className="panel scoreboard live-score">
        <div className="teams">
          <div className="left"><NationName nation={nations[0]} /></div>
          <div>
            <div className="score">{m.score[0]} x {m.score[1]}</div>
            {knockoutShootout && <div className="muted">pênaltis {m.shootout[0]} x {m.shootout[1]}</div>}
          </div>
          <div className="right"><NationName nation={nations[1]} /></div>
        </div>
        <div className="clock">{done ? 'Fim de jogo' : m.halftimeBanner ? 'Intervalo' : m.simFinished && m.buffer.length === 0 ? 'Pênaltis' : `${minute}'`}{m.state.extraTime && !done ? ' · prorrogação' : ''}</div>
      </div>

      {error && <div className="error">Erro: {error}</div>}

      <div className="live-grid">
        <div>
          <div className="pitch-wrap">
            <div ref={host} />
            {m.flash && <div className="flash">{m.flash}</div>}
            {m.halftimeBanner && <div className="flash soft">Intervalo — ajuste a tática ou faça substituições</div>}
          </div>
          <div className="ticker muted">{m.ticker}</div>
          <div className="row controls">
            <button onClick={togglePause} disabled={done || busy}>{m.paused ? '▶ Retomar' : '⏸ Pausar'}</button>
            <button className={m.speed === 1 ? 'active' : ''} onClick={() => { m.speed = 1; render(); }}>1x</button>
            <button className={m.speed === 4 ? 'active' : ''} onClick={() => { m.speed = 4; render(); }}>4x</button>
            <button onClick={instant} disabled={done || busy}>⏩ Instantâneo</button>
            <span className="spacer" />
            <button className={m.halftimeBanner ? 'primary' : ''} onClick={openPanel} disabled={done || busy || m.simFinished}>Substituir / Tática</button>
            {done && <button className="primary" onClick={() => m.report && m.record && onFinished(m.report, m.record)}>Ver pós-jogo</button>}
          </div>
          {panel && <ChangesPanel state={m.state} userSide={userSide} busy={busy} onClose={closePanel} onSub={(o, i) => call(() => engine.call('matchSubstitute', { side: userSide, outId: o, inId: i }))} onTactics={(t) => call(() => engine.call('matchTactics', { side: userSide, tactics: t }))} />}
        </div>
        <div className="panel feed">
          <h3>Narração</h3>
          <ul ref={feedEl} className="timeline">
            {m.feed.map((e, i) => (
              <li key={`${e.t}-${i}`} className={`${e.type === 'goal' ? 'mvp' : ''} ${e.team === userSide ? '' : 'opp'}`}>
                <span className="muted">{e.minute}'</span> {ICON[e.type] ?? ''} {e.text}
              </li>
            ))}
          </ul>
          <div className="muted" style={{ fontSize: '.8rem' }}>Trocas restantes: {side.subsLeft}</div>
        </div>
      </div>
    </div>
  );
}

function ChangesPanel({ state, userSide, busy, onClose, onSub, onTactics }: { state: LiveState; userSide: 0 | 1; busy: boolean; onClose: () => void; onSub: (out: string, inn: string) => void; onTactics: (t: Tactics) => void }) {
  const side = state.sides[userSide];
  const [out, setOut] = useState<string>('');
  const [inn, setInn] = useState<string>('');
  const [tac, setTac] = useState<Tactics>(side.tactics);
  const outs = side.onPitch.filter((p) => p.slot !== 'GK' || side.bench.some((b) => playerById(b.id)?.position === 'GK'));
  const dirty = JSON.stringify(tac) !== JSON.stringify(side.tactics);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="row between">
        <h3 style={{ margin: 0 }}>Mudanças · aos {state.minute}'</h3>
        <button className="primary" onClick={onClose}>Retomar jogo</button>
      </div>
      <div className="cols" style={{ marginTop: 10 }}>
        <div>
          <h3>Substituição ({side.subsLeft} restantes)</h3>
          <div className="muted" style={{ fontSize: '.85rem' }}>Sai</div>
          <table>
            <tbody>
              {outs.map((p) => {
                const pl = playerById(p.id)!;
                return (
                  <tr key={p.id} className={`clickable ${out === p.id ? 'called' : ''}`} onClick={() => setOut(p.id)}>
                    <td><PosPill p={{ position: pl.position, slot: p.slot }} /></td>
                    <td>{pl.name}</td>
                    <td className="num">{p.cond.toFixed(0)}%</td>
                    <td style={{ width: 60 }}><Bar value={p.cond} kind="cond" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: '.85rem', marginTop: 8 }}>Entra</div>
          <table>
            <tbody>
              {side.bench.map((b) => {
                const pl = playerById(b.id)!;
                return (
                  <tr key={b.id} className={`clickable ${inn === b.id ? 'called' : ''}`} onClick={() => setInn(b.id)}>
                    <td><PosPill p={pl} /></td>
                    <td>{pl.name}</td>
                    <td className="num"><b>{Math.round(overall(pl))}</b></td>
                    <td className="num">{b.cond.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button style={{ marginTop: 8 }} disabled={busy || !out || !inn || side.subsLeft <= 0} onClick={() => { onSub(out, inn); setOut(''); setInn(''); }}>
            Confirmar substituição
          </button>
        </div>
        <div>
          <h3>Tática</h3>
          <div className="opts" style={{ marginBottom: 10 }}>
            {FORMATIONS.map((f) => (
              <button key={f} className={tac.formation === f ? 'active' : ''} onClick={() => setTac({ ...tac, formation: f })}>{f}</button>
            ))}
          </div>
          {([['pressing', 'Pressão'], ['lineHeight', 'Linha'], ['tempo', 'Ritmo']] as const).map(([k, label]) => (
            <div key={k} className="slider">
              <span>{label}</span>
              <input type="range" min={0} max={100} value={Math.round(tac[k] * 100)} onChange={(e) => setTac({ ...tac, [k]: Number(e.target.value) / 100 })} />
              <span className="muted">{Math.round(tac[k] * 100)}%</span>
            </div>
          ))}
          <button style={{ marginTop: 8 }} disabled={busy || !dirty} onClick={() => onTactics(tac)}>Aplicar tática</button>
        </div>
      </div>
    </div>
  );
}
