import { useEffect, useMemo, useRef, useState } from 'react';
import type { LiveState, MatchCommand } from '../../engine/match';
import { STAGE_LABEL, type Fixture, type MatchRecord } from '../../engine/tournament';
import type { MatchEvent, MatchReport } from '../../engine/types';
import type { MatchDelta } from '../../engine/worker';
import { NationName } from '../components/common';
import { engine } from '../engineClient';
import { Choreo, type Fx, type PlayerBrief } from '../pitch/choreo';
import { PitchView, type DotMeta } from '../pitch/PitchView';
import { ChangesPanel, DecisionModal, HalftimeScreen, QuickSub, ShoutBar, TeamPanel } from './LiveParts';
import { nationsById, playerById } from '../world';

export interface LiveStart extends MatchDelta {
  fixture: Fixture;
  userSide: 0 | 1;
  /** Seed da partida; a coreografia deriva a sua dela. */
  seed: number;
}

/** Segundos de coreografia por minuto de jogo (em 4x o mesmo relógio roda com 4x mais passos fixos). */
const SEC_PER_MIN = 1.6;
type Speed = 1 | 4;

const FEED_TYPES = new Set<MatchEvent['type']>(['kickoff', 'goal', 'save', 'hard-save', 'miss', 'big-miss', 'post', 'offside', 'injury', 'foul', 'yellow', 'red', 'sub', 'tactic', 'halftime', 'fulltime', 'penalty-shootout']);
const DRAMATIC = new Set<MatchEvent['type']>(['goal', 'hard-save', 'big-miss', 'post']);
const SHOT_TYPES = new Set<MatchEvent['type']>(['goal', 'save', 'hard-save', 'miss', 'big-miss', 'post']);
const ICON: Partial<Record<MatchEvent['type'], string>> = { goal: '⚽', save: '🧤', 'hard-save': '🧤', miss: '💨', 'big-miss': '😱', post: '🥅', offside: '🚩', injury: '🚑', foul: '🦶', yellow: '🟨', red: '🟥', sub: '🔁', halftime: '⏸', fulltime: '🏁', 'penalty-shootout': '🎯', tactic: '📋', kickoff: '▶' };

const lastName = (name: string) => name.split(' ').slice(-1)[0] ?? name;

function colorDistance(a: string, b: string): number {
  const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(a) as [number, number, number];
  const [r2, g2, b2] = rgb(b) as [number, number, number];
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

interface FeedItem {
  key: number;
  minute: number;
  text: string;
  icon: string;
  mine: boolean;
  kind: 'event' | 'build';
  big: boolean;
  goal: boolean;
}

interface Model {
  displayClock: number;
  simClock: number;
  simFinished: boolean;
  fetching: boolean;
  paused: boolean;
  speed: Speed;
  buffer: MatchEvent[];
  feed: FeedItem[];
  feedKey: number;
  score: [number, number];
  shootout: [number, number];
  ticker: string;
  flash?: { title: string; sub: string };
  state: LiveState;
  report?: MatchReport;
  record?: MatchRecord;
  shownEnd: boolean;
  halftimeBanner: boolean;
  scoreBump: number;
  shake: number;
  replay?: { frames: ReturnType<Choreo['recent']>; idx: number; acc: number };
  replayAt: number;
  warp: number;
  /** O motor parou no intervalo: não busca mais jogo até o usuário voltar do vestiário. */
  holdFetch: boolean;
  /** Decisão do motor já exibida na tela (o jogo está parado esperando a resposta). */
  decisionShown: boolean;
}

export function LiveMatch({ start, speed0, onFinished, onBack }: { start: LiveStart; speed0: Speed; onFinished: (report: MatchReport, record: MatchRecord) => void; onBack: () => void }) {
  const { fixture, userSide } = start;
  const nations = [nationsById.get(fixture.home)!, nationsById.get(fixture.away)!] as const;
  const mine = nations[userSide];
  const colors = useMemo(() => {
    const c0 = nations[0].colors.primary;
    let c1 = nations[1].colors.primary;
    if (colorDistance(c0, c1) < 90) c1 = nations[1].colors.secondary;
    if (colorDistance(c0, c1) < 90) c1 = '#3b82d6';
    return [c0, c1] as const;
  }, [nations]);

  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const pitch = useRef<PitchView | undefined>(undefined);
  const choreo = useMemo(() => new Choreo(start.seed), [start]);
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
    feedKey: 0,
    score: [0, 0],
    shootout: [0, 0],
    ticker: 'Bola rolando…',
    state: start.state,
    shownEnd: false,
    halftimeBanner: false,
    scoreBump: 0,
    shake: 0,
    replayAt: 0,
    warp: 1,
    holdFetch: false,
    decisionShown: false,
  });
  const [, bump] = useState(0);
  const [panel, setPanel] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [quickOut, setQuickOut] = useState<string | null>(null);
  const render = () => bump((n) => n + 1);

  const briefs = (state: LiveState): PlayerBrief[] => {
    const out: PlayerBrief[] = [];
    ([0, 1] as const).forEach((side) => {
      for (const p of state.sides[side].onPitch) {
        const pl = playerById(p.id);
        if (!pl) continue;
        out.push({ id: p.id, name: lastName(pl.name), side, slot: p.slot, speed: pl.attrs.velocidade, skill: (pl.attrs.passe + pl.attrs.drible) / 2, iq: (pl.attrs.defesa + pl.attrs.passe) / 2, cond: p.cond, keeper: p.slot === 'GK' });
      }
    });
    return out;
  };

  const syncLineups = () => {
    const m = model.current;
    choreo.setLineups(briefs(m.state), [m.state.sides[0].tactics.lineHeight, m.state.sides[1].tactics.lineHeight]);
    const metas: DotMeta[] = [];
    ([0, 1] as const).forEach((side) => {
      for (const p of m.state.sides[side].onPitch) {
        metas.push({ id: p.id, label: lastName(playerById(p.id)?.name ?? p.id), color: colors[side], border: side === userSide ? '#f2c744' : '#ffffff', keeper: p.slot === 'GK' });
      }
    });
    pitch.current?.setMeta(metas);
  };

  const addFeed = (item: Omit<FeedItem, 'key'>) => {
    const m = model.current;
    m.feed = [{ ...item, key: m.feedKey++ }, ...m.feed].slice(0, 90);
  };

  const names = (id: string) => lastName(playerById(id)?.name ?? id);

  /** Chamado pelo coreógrafo quando a jogada do evento termina: aqui o placar, o texto e o clima da tela mudam. */
  const commit = (ev: MatchEvent) => {
    const m = model.current;
    if (ev.type === 'goal') {
      m.score[ev.team]++;
      m.scoreBump++;
      m.flash = { title: 'GOL!', sub: `${playerById(ev.playerId ?? '')?.name ?? ''} · ${ev.minute}' · ${nationsById.get(ev.team === 0 ? fixture.home : fixture.away)?.country}` };
      m.replayAt = performance.now() + 2400;
      setTimeout(() => {
        if (model.current.flash?.title === 'GOL!') {
          model.current.flash = undefined;
          render();
        }
      }, 2600);
    }
    if (ev.type === 'penalty-shootout' && ev.scored) m.shootout[ev.team]++;
    if (ev.type === 'advance' || ev.type === 'possession-change') m.ticker = ev.text;
    if (FEED_TYPES.has(ev.type)) {
      addFeed({ minute: ev.minute, text: ev.text, icon: ICON[ev.type] ?? '', mine: ev.team === userSide, kind: 'event', big: DRAMATIC.has(ev.type), goal: ev.type === 'goal' });
    }
    if (ev.type === 'halftime') {
      m.paused = true;
      m.halftimeBanner = true;
    }
  };

  const onFx = (fx: Fx) => {
    const m = model.current;
    if (fx.kind === 'net') pitch.current?.netRippleFor(fx.side === 0 ? 0 : 1);
    if (fx.kind === 'goal') {
      pitch.current?.confetti([colors[fx.side], nations[fx.side].colors.secondary, '#ffffff'], fx.side);
      m.shake = performance.now() + 650;
    }
    if (fx.kind === 'post') m.shake = performance.now() + 250;
  };

  const feedBuildUp = (lines: string[], ev: MatchEvent) => {
    lines.forEach((text, i) => addFeed({ minute: ev.minute, text, icon: '', mine: ev.team === userSide, kind: 'build', big: i > 0, goal: false }));
  };

  /** Move para o coreógrafo os eventos cujo instante já chegou. */
  const drain = (all = false) => {
    const m = model.current;
    while (m.buffer.length) {
      const ev = m.buffer[0] as MatchEvent;
      if (!all && (ev.t ?? 0) > m.displayClock) break;
      m.buffer.shift();
      choreo.push(ev, names);
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
    if (d.events.some((e) => e.type === 'halftime') || d.state.decision) m.holdFetch = true;
    syncLineups();
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

  const flushAll = () => {
    drain(true);
    choreo.flush();
    const m = model.current;
    m.displayClock = Math.max(m.displayClock, m.simClock);
  };

  /** Ritmo variável: o relógio acelera quando nada acontece e desacelera nas jogadas de perigo. */
  const rhythm = (): number => {
    const m = model.current;
    const ahead = m.buffer.find((e) => SHOT_TYPES.has(e.type));
    const soonDanger = ahead && (ahead.t ?? 0) - m.displayClock < 0.7;
    const q = choreo.pending;
    let w = 1;
    if (q >= 4) w = 0.25;
    else if (q >= 2) w = 0.55;
    if (soonDanger) w *= 0.6;
    else if (!ahead && q === 0 && !m.simFinished) w = Math.min(1.6, w * 1.6);
    return w;
  };

  // campo Pixi + coreografia
  useEffect(() => {
    choreo.onCommit = commit;
    choreo.onFx = onFx;
    choreo.onLines = feedBuildUp;
    const pv = new PitchView(host.current as HTMLElement);
    pitch.current = pv;
    let cancelled = false;
    void pv.init().then(() => {
      if (cancelled) return;
      syncLineups();
      // coloca todos nas posições-base antes do apito
      choreo.advance(2);
      drawNow();
      render();
    });
    return () => {
      cancelled = true;
      pv.destroy();
      pitch.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawNow = () => {
    const pv = pitch.current;
    if (!pv) return;
    const pos = new Map<string, { x: number; y: number }>();
    for (const a of choreo.agents.values()) pos.set(a.id, { x: a.x, y: a.y });
    pv.draw(pos, choreo.ball);
  };

  const startReplay = () => {
    const m = model.current;
    const frames = choreo.recent(7.5);
    if (frames.length < 10) return;
    m.replay = { frames, idx: 0, acc: 0 };
    pitch.current?.setBanner('REPLAY');
  };

  const stopReplay = () => {
    const m = model.current;
    m.replay = undefined;
    m.replayAt = 0;
    pitch.current?.setBanner('');
    drawNow();
    render();
  };

  // laço de reprodução
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastRender = 0;
    const frame = (now: number) => {
      const dtReal = Math.min((now - last) / 1000, 0.25);
      last = now;
      const m = model.current;
      if (m.replay) {
        const r = m.replay;
        r.acc += dtReal * 30 * 0.6;
        r.idx = Math.floor(r.acc);
        const f = r.frames[Math.min(r.idx, r.frames.length - 1)];
        if (f) {
          const pos = new Map<string, { x: number; y: number }>();
          f.ids.forEach((id, i) => pos.set(id, { x: f.p[i * 2] as number, y: f.p[i * 2 + 1] as number }));
          pitch.current?.draw(pos, { x: f.b[0], y: f.b[1], z: f.b[2] });
        }
        if (r.idx >= r.frames.length) stopReplay();
      } else {
        const finishing = m.simFinished && m.buffer.length === 0 && !choreo.busy;
        if (!m.paused && !finishing) {
          const dTau = dtReal * m.speed;
          m.warp = rhythm();
          choreo.advance(dTau);
          m.displayClock += (dTau / SEC_PER_MIN) * m.warp;
          if (!m.fetching && !m.simFinished && !m.holdFetch && m.simClock < m.displayClock + 0.7) void fetchMore(m.displayClock + 1.3);
          drain();
          if (m.replayAt && now > m.replayAt && !choreo.busy && m.buffer.length === 0 && !m.fetching) {
            m.replayAt = 0;
            m.paused = true;
            startReplay();
            if (!m.replay) m.paused = false;
          }
        }
        // o motor parou numa decisão: mostra o modal quando a jogada em curso terminar
        if (m.state.decision && !m.decisionShown && m.buffer.length === 0 && !choreo.busy && !m.fetching) {
          m.decisionShown = true;
          m.paused = true;
        }
        if (finishing && !m.shownEnd) m.shownEnd = true;
        drawNow();
      }
      if (now - lastRender > 90) {
        lastRender = now;
        render();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const m = model.current;
  useEffect(() => {
    if (feedEl.current) feedEl.current.scrollTop = 0;
  }, [m.feed.length]);
  const halftimeOpen = m.halftimeBanner && !m.replay;
  useEffect(() => {
    if (halftimeOpen) document.querySelector('.halftime')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [halftimeOpen]);

  const call = async (fn: () => Promise<MatchDelta>) => {
    setBusy(true);
    setError(undefined);
    try {
      absorb(await fn());
      flushAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      render();
    }
  };

  /** Envia um comando ao motor sem parar o jogo (gritos). */
  const sendSoft = async (cmd: MatchCommand) => {
    try {
      absorb(await engine.call('matchCommand', { cmd }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    render();
  };

  /** Envia um comando com o jogo parado (troca, tática, conversa): alinha a tela com o motor antes. */
  const send = (cmd: MatchCommand) => void call(() => engine.call('matchCommand', { cmd }));

  const answerDecision = (cmd: MatchCommand) =>
    void call(() => engine.call('matchCommand', { cmd })).then(() => {
      m.decisionShown = false;
      if (!m.state.decision && !m.halftimeBanner) {
        m.holdFetch = false;
        m.paused = false;
      }
      render();
    });

  const resumeSecondHalf = () => {
    m.halftimeBanner = false;
    m.holdFetch = false;
    m.paused = false;
    render();
  };

  const pickQuick = (id: string) => {
    if (m.replay) stopReplay();
    m.paused = true;
    flushAll();
    setQuickOut(id);
  };

  const togglePause = () => {
    if (m.replay) stopReplay();
    m.paused = !m.paused;
    m.halftimeBanner = false;
    render();
  };

  const openPanel = () => {
    if (m.replay) stopReplay();
    m.paused = true;
    flushAll();
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
      if (m.replay) stopReplay();
      const d = await engine.call('matchFinish', {});
      m.paused = false;
      m.replayAt = 0;
      return d;
    });

  const done = m.shownEnd && m.report !== undefined;
  const minute = Math.min(Math.floor(m.displayClock) + 1, m.state.extraTime ? 120 : 90);
  const side = m.state.sides[userSide];
  const hasShootout = m.shootout[0] + m.shootout[1] > 0 || m.feed.some((e) => e.icon === '🎯');
  const shaking = m.shake > performance.now();

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
            <div className="score">
              <span key={`a${m.score[0]}`} className={m.scoreBump ? 'bump' : ''}>{m.score[0]}</span> x <span key={`b${m.score[1]}`} className={m.scoreBump ? 'bump' : ''}>{m.score[1]}</span>
            </div>
            {hasShootout && <div className="muted">pênaltis {m.shootout[0]} x {m.shootout[1]}</div>}
          </div>
          <div className="right"><NationName nation={nations[1]} /></div>
        </div>
        <div className="clock">{done ? 'Fim de jogo' : m.halftimeBanner ? 'Intervalo' : m.simFinished && m.report?.shootout && m.buffer.length === 0 ? 'Pênaltis' : m.simFinished && m.buffer.length === 0 && !choreo.busy ? 'Fim de jogo' : `${minute}'`}{m.state.extraTime && !done ? ' · prorrogação' : ''}</div>
      </div>

      {error && <div className="error">Erro: {error}</div>}

      <div className="live-grid">
        <div>
          <div ref={wrap} className={`pitch-wrap ${shaking ? 'shake' : ''}`}>
            <div ref={host} />
            {m.flash && (
              <div className="goal-banner" key={m.flash.sub}>
                <div className="goal-title">{m.flash.title}</div>
                <div className="goal-sub">{m.flash.sub}</div>
              </div>
            )}
            {m.replay && <button className="skip-replay" onClick={stopReplay}>Pular replay ⏭</button>}
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
          <ShoutBar state={m.state} userSide={userSide} clock={m.simClock} disabled={done || m.simFinished || m.halftimeBanner} send={(c) => void sendSoft(c)} />
          {m.halftimeBanner && !done && (
            <HalftimeScreen state={m.state} userSide={userSide} fixtureNations={[fixture.home, fixture.away]} busy={busy} send={send} onResume={resumeSecondHalf} />
          )}
          {panel && <ChangesPanel state={m.state} userSide={userSide} busy={busy} onClose={closePanel} send={send} />}
        </div>
        <div className="side-col">
          <TeamPanel state={m.state} userSide={userSide} onPick={pickQuick} />
        <div className="panel feed">
          <h3>Narração</h3>
          <ul ref={feedEl} className="timeline">
            {m.feed.map((e) => (
              <li key={e.key} className={`${e.goal ? 'mvp' : ''} ${e.mine ? '' : 'opp'} ${e.kind === 'build' ? 'build' : ''} ${e.big ? 'big' : ''}`}>
                <span className="muted">{e.minute}'</span> {e.icon} {e.text}
              </li>
            ))}
          </ul>
          <div className="muted" style={{ fontSize: '.8rem' }}>Trocas restantes: {side.subsLeft}</div>
        </div>
        </div>
      </div>
      {m.decisionShown && m.state.decision && m.state.decision.side === userSide && (
        <DecisionModal state={m.state} userSide={userSide} decision={m.state.decision} busy={busy} send={answerDecision} />
      )}
      {quickOut && (
        <QuickSub
          state={m.state}
          userSide={userSide}
          outId={quickOut}
          busy={busy}
          onClose={() => {
            setQuickOut(null);
            m.paused = false;
            render();
          }}
          onConfirm={(inId) => {
            const outId = quickOut;
            setQuickOut(null);
            void call(() => engine.call('matchCommand', { cmd: { kind: 'sub', side: userSide, outId, inId } })).then(() => {
              m.paused = false;
              render();
            });
          }}
        />
      )}
    </div>
  );
}
