import { useState } from 'react';
import { FORMATIONS } from '../../engine/formations';
import type { Decision, LiveState, MatchCommand, Shout, TalkTone } from '../../engine/match';
import { SHOUT_MINUTES } from '../../engine/match';
import { overall } from '../../engine/player';
import type { Tactics, TeamMatchStats } from '../../engine/types';
import { Bar, NationName, PosPill } from '../components/common';
import { nationsById, playerById } from '../world';

export type Send = (cmd: MatchCommand) => void;

// ---------- gritos ----------

const SHOUTS: { key: Shout; label: string; hint: string }[] = [
  { key: 'press', label: 'Pressionar', hint: 'Recupera a bola mais alto, mas cansa bem mais.' },
  { key: 'drop', label: 'Recuar', hint: 'Fecha a defesa e poupa o time, cedendo o meio.' },
  { key: 'long', label: 'Bola longa', hint: 'Ligação direta: mais bolas nas costas, passes menos precisos.' },
  { key: 'short', label: 'Toque curto', hint: 'Passes seguros e posse, com menos chutes de longe.' },
];

export function ShoutBar({ state, userSide, clock, disabled, send }: { state: LiveState; userSide: 0 | 1; clock: number; disabled: boolean; send: Send }) {
  const side = state.sides[userSide];
  const active = side.shout && side.shout.until > clock ? side.shout : undefined;
  const cooling = !active && clock < side.cooldownUntil ? Math.ceil(side.cooldownUntil - clock) : 0;
  return (
    <div className="shouts">
      <span className="muted">Gritos ({SHOUT_MINUTES} min, recarga de {SHOUT_MINUTES}):</span>
      {SHOUTS.map((s) => {
        const on = active?.kind === s.key;
        return (
          <button key={s.key} className={on ? 'active' : ''} disabled={disabled || (!!active && !on) || cooling > 0 || on} title={s.hint} onClick={() => send({ kind: 'shout', side: userSide, shout: s.key })}>
            {s.label}
            {on && active ? ` · ${Math.max(1, Math.ceil(active.until - clock))}'` : ''}
          </button>
        );
      })}
      {cooling > 0 && <span className="muted">recarga {cooling}'</span>}
    </div>
  );
}

// ---------- painel do meu time + troca rápida ----------

export function TeamPanel({ state, userSide, onPick }: { state: LiveState; userSide: 0 | 1; onPick: (id: string) => void }) {
  const side = state.sides[userSide];
  return (
    <div className="panel">
      <h3>Meu time</h3>
      <table>
        <tbody>
          {side.onPitch.map((p) => {
            const pl = playerById(p.id);
            if (!pl) return null;
            const rating = state.ratings[p.id] ?? 6;
            const alert = p.cond < 60 || rating < 5.6;
            return (
              <tr key={p.id} className={`clickable ${alert ? 'blink' : ''}`} onClick={() => onPick(p.id)} title={alert ? 'Cansado ou mal na partida: clique para trocar' : 'Clique para trocar'}>
                <td><PosPill p={{ position: pl.position, slot: p.slot }} /></td>
                <td>{pl.name.split(' ').slice(-1)[0]}</td>
                <td className="num">{rating.toFixed(1)}</td>
                <td style={{ width: 54 }}><Bar value={p.cond} kind="cond" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Sugestões de reposição: mesma posição primeiro, depois por nota x condição. */
export function suggestions(state: LiveState, userSide: 0 | 1, outId: string) {
  const side = state.sides[userSide];
  const out = playerById(outId);
  return side.bench
    .map((b) => ({ b, pl: playerById(b.id)! }))
    .filter((x) => x.pl)
    .sort((x, y) => {
      const sx = (x.pl.position === out?.position ? 1000 : 0) + overall(x.pl) * (0.7 + 0.3 * (x.b.cond / 100));
      const sy = (y.pl.position === out?.position ? 1000 : 0) + overall(y.pl) * (0.7 + 0.3 * (y.b.cond / 100));
      return sy - sx;
    });
}

export function QuickSub({ state, userSide, outId, busy, onConfirm, onClose }: { state: LiveState; userSide: 0 | 1; outId: string; busy: boolean; onConfirm: (inId: string) => void; onClose: () => void }) {
  const out = playerById(outId);
  const side = state.sides[userSide];
  const list = suggestions(state, userSide, outId);
  const cond = side.onPitch.find((p) => p.id === outId)?.cond ?? 0;
  return (
    <div className="modal">
      <div className="panel modal-box">
        <h3>Substituir {out?.name}</h3>
        <div className="muted" style={{ marginBottom: 8 }}>
          Condição {Math.round(cond)}% · nota {(state.ratings[outId] ?? 6).toFixed(1)} · {side.subsLeft} trocas restantes · jogo pausado
        </div>
        <table>
          <tbody>
            {list.slice(0, 7).map(({ b, pl }, i) => (
              <tr key={b.id} className="clickable" onClick={() => !busy && side.subsLeft > 0 && onConfirm(b.id)}>
                <td><PosPill p={pl} /></td>
                <td>{pl.name}{i === 0 ? ' ★' : ''}</td>
                <td className="num"><b>{Math.round(overall(pl))}</b></td>
                <td className="num">{Math.round(b.cond)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="ghost" onClick={onClose}>Manter em campo</button>
        </div>
      </div>
    </div>
  );
}

// ---------- tática e trocas (painel completo) ----------

export function ChangesPanel({ state, userSide, busy, onClose, send, embedded }: { state: LiveState; userSide: 0 | 1; busy: boolean; onClose?: () => void; send: Send; embedded?: boolean }) {
  const side = state.sides[userSide];
  const [out, setOut] = useState<string>('');
  const [inn, setInn] = useState<string>('');
  const [tac, setTac] = useState<Tactics>(side.tactics);
  const outs = side.onPitch.filter((p) => p.slot !== 'GK' || side.bench.some((b) => playerById(b.id)?.position === 'GK'));
  const dirty = JSON.stringify(tac) !== JSON.stringify(side.tactics);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      {!embedded && (
        <div className="row between">
          <h3 style={{ margin: 0 }}>Mudanças · aos {state.minute}'</h3>
          <button className="primary" onClick={onClose}>Retomar jogo</button>
        </div>
      )}
      <div className="cols" style={{ marginTop: embedded ? 0 : 10 }}>
        <div>
          <h3>Substituição ({side.subsLeft} restantes)</h3>
          <div className="muted" style={{ fontSize: '.85rem' }}>Sai</div>
          <table>
            <tbody>
              {outs.map((p) => {
                const pl = playerById(p.id)!;
                return (
                  <tr key={p.id} className={`clickable ${out === p.id ? 'called' : ''}`} onClick={() => { setOut(p.id); setInn(''); }}>
                    <td><PosPill p={{ position: pl.position, slot: p.slot }} /></td>
                    <td>{pl.name}</td>
                    <td className="num">{(state.ratings[p.id] ?? 6).toFixed(1)}</td>
                    <td className="num">{p.cond.toFixed(0)}%</td>
                    <td style={{ width: 60 }}><Bar value={p.cond} kind="cond" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: '.85rem', marginTop: 8 }}>Entra {out ? '(sugestões primeiro)' : ''}</div>
          <table>
            <tbody>
              {(out ? suggestions(state, userSide, out) : side.bench.map((b) => ({ b, pl: playerById(b.id)! }))).map(({ b, pl }) => (
                <tr key={b.id} className={`clickable ${inn === b.id ? 'called' : ''}`} onClick={() => setInn(b.id)}>
                  <td><PosPill p={pl} /></td>
                  <td>{pl.name}</td>
                  <td className="num"><b>{Math.round(overall(pl))}</b></td>
                  <td className="num">{b.cond.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button style={{ marginTop: 8 }} disabled={busy || !out || !inn || side.subsLeft <= 0} onClick={() => { send({ kind: 'sub', side: userSide, outId: out, inId: inn }); setOut(''); setInn(''); }}>
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
          <button style={{ marginTop: 8 }} disabled={busy || !dirty} onClick={() => send({ kind: 'tactics', side: userSide, tactics: tac })}>Aplicar tática</button>
        </div>
      </div>
    </div>
  );
}

// ---------- intervalo ----------

const STAT_ROWS: { key: keyof TeamMatchStats; label: string; fmt?: (v: number) => string }[] = [
  { key: 'possession', label: 'Posse', fmt: (v) => `${Math.round(v)}%` },
  { key: 'shots', label: 'Finalizações' },
  { key: 'shotsOnTarget', label: 'No alvo' },
  { key: 'xg', label: 'xG', fmt: (v) => v.toFixed(2) },
  { key: 'offsides', label: 'Impedimentos' },
  { key: 'fouls', label: 'Faltas' },
];

export function StatBars({ stats }: { stats: [TeamMatchStats, TeamMatchStats] }) {
  return (
    <>
      {STAT_ROWS.map(({ key, label, fmt }) => {
        const x = stats[0][key];
        const y = stats[1][key];
        const total = x + y || 1;
        const f = fmt ?? ((v: number) => String(v));
        return (
          <div key={key} className="statrow">
            <span className="l"><b>{f(x)}</b></span>
            <div>
              <div className="label">{label}</div>
              <div className="split"><i style={{ width: `${(x / total) * 100}%` }} /><i style={{ width: `${(y / total) * 100}%` }} /></div>
            </div>
            <span><b>{f(y)}</b></span>
          </div>
        );
      })}
    </>
  );
}

const TALKS: { tone: TalkTone; label: string; hint: string }[] = [
  { tone: 'motivate', label: 'Motivar', hint: 'Quase sempre ajuda um pouco; às vezes soa vazio.' },
  { tone: 'demand', label: 'Cobrar', hint: 'Grande efeito, grande risco. Funciona melhor quando o time está perdendo.' },
  { tone: 'calm', label: 'Acalmar', hint: 'Pouco efeito na força, mas reduz faltas e cartões.' },
];

export function HalftimeScreen({ state, userSide, fixtureNations, busy, send, onResume }: { state: LiveState; userSide: 0 | 1; fixtureNations: [string, string]; busy: boolean; send: Send; onResume: () => void }) {
  const nations = [nationsById.get(fixtureNations[0])!, nationsById.get(fixtureNations[1])!] as const;
  const side = state.sides[userSide];
  const mine = state.sides[userSide].onPitch
    .map((p) => ({ p, pl: playerById(p.id)!, r: state.ratings[p.id] ?? 6 }))
    .sort((a, b) => b.r - a.r);
  const best = mine.slice(0, 3);
  const worst = mine.slice(-3).reverse();
  const moraleText = side.morale > 0.001 ? 'Moral alta' : side.morale < -0.001 ? 'Moral baixa' : 'Moral normal';
  return (
    <div className="panel halftime">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Intervalo · {state.score[0]} x {state.score[1]}</h2>
        <button className="primary" onClick={onResume} disabled={busy}>Começar o 2º tempo</button>
      </div>
      <div className="cols" style={{ marginTop: 12 }}>
        <div>
          <h3>Primeiro tempo</h3>
          <div className="row between muted" style={{ fontSize: '.85rem' }}>
            <span><NationName nation={nations[0]} short /></span>
            <span><NationName nation={nations[1]} short /></span>
          </div>
          <StatBars stats={state.stats} />
          <div className="cols" style={{ marginTop: 10 }}>
            <div>
              <h3>Em alta</h3>
              {best.map(({ pl, r }) => <div key={pl.id}>{pl.name.split(' ').slice(-1)[0]} <b className="good">{r.toFixed(1)}</b></div>)}
            </div>
            <div>
              <h3>Em baixa</h3>
              {worst.map(({ pl, r }) => <div key={pl.id}>{pl.name.split(' ').slice(-1)[0]} <b className="bad">{r.toFixed(1)}</b></div>)}
            </div>
          </div>
        </div>
        <div>
          <h3>Conversa de vestiário</h3>
          <div className="muted" style={{ marginBottom: 6 }}>{moraleText}{side.talked ? ' · você já conversou com o time' : ''}</div>
          <div className="opts">
            {TALKS.map((t) => (
              <button key={t.tone} disabled={busy || side.talked} title={t.hint} onClick={() => send({ kind: 'talk', side: userSide, tone: t.tone })}>{t.label}</button>
            ))}
          </div>
          <ul className="muted" style={{ paddingLeft: 18, fontSize: '.85rem' }}>
            {TALKS.map((t) => <li key={t.tone}><b>{t.label}:</b> {t.hint}</li>)}
          </ul>
        </div>
      </div>
      <ChangesPanel state={state} userSide={userSide} busy={busy} send={send} embedded />
    </div>
  );
}

// ---------- momentos de decisão ----------

const fin = (id: string, cond: number) => (playerById(id)?.attrs.finalizacao ?? 0) * (0.7 + 0.3 * (cond / 100));

export function DecisionModal({ state, userSide, decision, busy, send }: { state: LiveState; userSide: 0 | 1; decision: Decision; busy: boolean; send: Send }) {
  const side = state.sides[userSide];
  const answer = (choice: string, order?: string[]) => send({ kind: 'decide', side: userSide, id: decision.id, choice, order });

  if (decision.kind === 'injury') {
    const pl = playerById(decision.playerId);
    const cond = side.onPitch.find((p) => p.id === decision.playerId)?.cond ?? 0;
    const list = suggestions(state, userSide, decision.playerId);
    return (
      <div className="modal">
        <div className="panel modal-box">
          <h3>🚑 {pl?.name} está lesionado</h3>
          <p className="muted">Condição {Math.round(cond)}% · {side.subsLeft} trocas restantes. Se ficar em campo, rende bem menos pelo resto do jogo.</p>
          {side.subsLeft > 0 ? (
            <table>
              <tbody>
                {list.slice(0, 6).map(({ b, pl: r }, i) => (
                  <tr key={b.id} className="clickable" onClick={() => !busy && answer(b.id)}>
                    <td><PosPill p={r} /></td>
                    <td>{r.name}{i === 0 ? ' ★' : ''}</td>
                    <td className="num"><b>{Math.round(overall(r))}</b></td>
                    <td className="num">{Math.round(b.cond)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="bad">Sem trocas restantes: ele precisa ficar em campo.</p>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button disabled={busy} onClick={() => answer('keep')}>Manter em campo</button>
          </div>
        </div>
      </div>
    );
  }

  if (decision.kind === 'desperate') {
    return (
      <div className="modal">
        <div className="panel modal-box">
          <h3>⏱ Perdendo aos {state.minute}'</h3>
          <p className="muted">O que o treinador faz?</p>
          <div className="choices">
            <button disabled={busy} onClick={() => answer('allin')}>
              <b>Tudo ou nada</b>
              <span>+10% no ataque, -10% na defesa, pressão e ritmo no máximo. Mais chances, mais espaço para o contra-ataque.</span>
            </button>
            <button disabled={busy} onClick={() => answer('hold')}>
              <b>Segurar</b>
              <span>Mantém a organização: +5% na defesa, -3% no ataque. Evita levar mais gols, mas dificulta a virada.</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (decision.kind === 'penalty') {
    const takers = side.onPitch
      .filter((p) => p.slot !== 'GK')
      .map((p) => ({ p, score: fin(p.id, p.cond) }))
      .sort((a, b) => b.score - a.score);
    return (
      <div className="modal">
        <div className="panel modal-box">
          <h3>⚽ Pênalti a favor!</h3>
          <p className="muted">Escolha o batedor. Finalização e condição física pesam na cobrança.</p>
          <table>
            <tbody>
              {takers.slice(0, 8).map(({ p }, i) => {
                const pl = playerById(p.id)!;
                return (
                  <tr key={p.id} className="clickable" onClick={() => !busy && answer(p.id)}>
                    <td><PosPill p={{ position: pl.position, slot: p.slot }} /></td>
                    <td>{pl.name}{i === 0 ? ' ★' : ''}</td>
                    <td className="num">FIN {pl.attrs.finalizacao}</td>
                    <td className="num">{Math.round(p.cond)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return <ShootoutOrder state={state} userSide={userSide} busy={busy} onConfirm={(order) => answer('', order)} />;
}

function ShootoutOrder({ state, userSide, busy, onConfirm }: { state: LiveState; userSide: 0 | 1; busy: boolean; onConfirm: (order: string[]) => void }) {
  const side = state.sides[userSide];
  const [order, setOrder] = useState<string[]>(() =>
    side.onPitch
      .filter((p) => p.slot !== 'GK')
      .sort((a, b) => fin(b.id, b.cond) - fin(a.id, a.cond))
      .map((p) => p.id),
  );
  const move = (i: number, d: -1 | 1) =>
    setOrder((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j] as string, next[i] as string];
      return next;
    });
  return (
    <div className="modal">
      <div className="panel modal-box">
        <h3>🎯 Disputa de pênaltis: ordem dos batedores</h3>
        <p className="muted">Os 5 primeiros cobram na ordem; depois, os demais nas cobranças alternadas.</p>
        <table>
          <tbody>
            {order.map((id, i) => {
              const pl = playerById(id)!;
              const cond = side.onPitch.find((p) => p.id === id)?.cond ?? 0;
              return (
                <tr key={id} style={{ opacity: i < 5 ? 1 : 0.6 }}>
                  <td className="num">{i + 1}º</td>
                  <td>{pl.name}</td>
                  <td className="num">FIN {pl.attrs.finalizacao}</td>
                  <td className="num">{Math.round(cond)}%</td>
                  <td>
                    <button className="ghost" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
                    <button className="ghost" onClick={() => move(i, 1)} disabled={i === order.length - 1}>▼</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" disabled={busy} onClick={() => onConfirm(order)}>Confirmar ordem</button>
        </div>
      </div>
    </div>
  );
}
