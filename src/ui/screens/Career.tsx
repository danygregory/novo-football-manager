import { useMemo } from 'react';
import { squadOf } from '../../data/squads';
import { STAGE_VALUE_LABEL, careerCut, summarizeCareer, worldPercentile, worldPot, type Career } from '../../engine/career';
import type { NationEra } from '../../engine/types';
import { Bar, Kit, STYLE_LABEL } from '../components/common';
import { eraSpan, nationLabel, nationsById, world } from '../world';

export function TeamCard({ n, onPick, label }: { n: NationEra; onPick: () => void; label: string }) {
  const star = useMemo(() => squadOf(n).find((p) => p.star), [n]);
  const pot = worldPot(world, n.elo);
  return (
    <div className="panel team-card">
      <div className="row between">
        <h3 style={{ margin: 0 }}><Kit nation={n} />{n.country}</h3>
        <span className="chip">{eraSpan(n)}</span>
      </div>
      <div className="row" style={{ margin: '6px 0' }}>
        <span className="chip accent">Elo {Math.round(n.elo)}</span>
        <span className="chip">pote {pot}</span>
        <span className="chip">{STYLE_LABEL[n.playStyle]}</span>
        <span className="chip">top {100 - n.percentile + 1}% da época</span>
      </div>
      {star && <div style={{ fontSize: '.9rem' }}>⭐ {star.name}, <b>{star.trait}</b></div>}
      <p className="muted" style={{ fontSize: '.82rem', margin: '6px 0 10px' }}>{n.summary}</p>
      <button className="primary" onClick={onPick}>{label}</button>
    </div>
  );
}

/** Escolha da seleção: início da carreira (3 sorteadas dos potes 3 e 4) ou convites depois de uma Copa. */
export function CareerChoose({ title, subtitle, ids, onPick, onBack, backLabel }: { title: string; subtitle: string; ids: string[]; onPick: (id: string) => void; onBack?: () => void; backLabel?: string }) {
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>{title}</h2>
          <div className="muted">{subtitle}</div>
        </div>
        {onBack && <button onClick={onBack}>{backLabel ?? 'Voltar'}</button>}
      </div>
      <div className="cols-3">
        {ids.map((id) => {
          const n = nationsById.get(id);
          return n ? <TeamCard key={id} n={n} label="Treinar esta seleção" onPick={() => onPick(id)} /> : null;
        })}
        {ids.length === 0 && <div className="panel muted">Nenhum convite desta vez. Continue com a sua seleção e mostre serviço.</div>}
      </div>
    </div>
  );
}

export function CareerHome({ career, onPlay, onAbandon, onBack }: { career: Career; onPlay: () => void; onAbandon: () => void; onBack: () => void }) {
  const nation = career.nationId ? nationsById.get(career.nationId) : undefined;
  const sum = summarizeCareer(career);
  const cut = nation ? careerCut(world, nation) : 'all';
  const pct = nation ? worldPercentile(world, nation.elo) : 0;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>Carreira de técnico</h2>
          <div className="muted">Reputação sobe com campanhas acima do esperado para a força do time e cai com fracassos. Depois de cada Copa chegam de 0 a 3 convites.</div>
        </div>
        <button className="ghost" onClick={onBack}>Início</button>
      </div>
      <div className="cols">
        <div className="panel">
          <h3>Reputação</h3>
          <div className="row between"><b style={{ fontSize: '1.6rem' }}>{career.rep}</b><span className="muted">de 100</span></div>
          <Bar value={career.rep} />
          {nation && (
            <>
              <h3 style={{ marginTop: 16 }}>Seleção atual</h3>
              <div><Kit nation={nation} /><b>{nationLabel(nation)}</b></div>
              <div className="muted" style={{ margin: '4px 0 10px' }}>Elo {Math.round(nation.elo)} · força no mundo: percentil {pct} · próxima Copa com adversários {cut === 'all' ? 'de todas as eras' : `dos anos ${String(cut).slice(2)}`}</div>
              <div className="row">
                <button className="primary" onClick={onPlay}>Jogar a próxima Copa</button>
                <button className="ghost" onClick={() => { if (confirm('Abandonar a carreira? O histórico será apagado.')) onAbandon(); }}>Abandonar a carreira</button>
              </div>
            </>
          )}
        </div>
        <div className="panel">
          <h3>Histórico</h3>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="chip accent">{sum.cups} Copas</span>
            <span className="chip accent">{sum.titles} títulos</span>
            {sum.best && <span className="chip">melhor: {STAGE_VALUE_LABEL[sum.best.stage]} ({sum.best.teamLabel})</span>}
          </div>
          {career.entries.length === 0 ? (
            <p className="muted">Nenhuma Copa ainda. Sua carreira começa agora.</p>
          ) : (
            <table>
              <thead><tr><th>Copa</th><th>Seleção</th><th>Campanha</th><th className="num">J-V-E-D</th><th className="num">Rep.</th></tr></thead>
              <tbody>
                {[...career.entries].reverse().map((e) => (
                  <tr key={e.n} className={e.champion ? 'me' : ''}>
                    <td>{e.n}ª</td>
                    <td>{e.teamLabel} <span className="muted">pote {e.pot}</span></td>
                    <td>{STAGE_VALUE_LABEL[e.stage]}</td>
                    <td className="num">{e.w + e.d + e.l}-{e.w}-{e.d}-{e.l}</td>
                    <td className="num">{e.repBefore}→<b>{e.repAfter}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {sum.teams.length > 0 && <p className="muted" style={{ marginBottom: 0 }}>Seleções treinadas: {sum.teams.map((t) => `${t.label} (${t.cups})`).join(', ')}</p>}
        </div>
      </div>
    </div>
  );
}

/** Depois da Copa na carreira: o que mudou na reputação e os convites recebidos. */
export function CareerAfterCup({ career, result, onChoose, onKeep }: { career: Career; result: { delta: number; ev: { stage: number; expectedStage: number; perf: number; pot: number } }; onChoose: (id: string) => void; onKeep: () => void }) {
  const last = career.entries[career.entries.length - 1];
  const nation = career.nationId ? nationsById.get(career.nationId) : undefined;
  const up = result.delta >= 0;
  return (
    <div style={{ textAlign: 'left', margin: '14px 0' }}>
      <div className="panel">
        <h3>Carreira · reputação</h3>
        <div className="row between">
          <span><b style={{ fontSize: '1.4rem' }}>{last?.repBefore}</b> → <b style={{ fontSize: '1.4rem' }} className={up ? 'good' : 'bad'}>{career.rep}</b> <span className={up ? 'good' : 'bad'}>({up ? '+' : ''}{result.delta})</span></span>
          <span className="muted">
            esperado para a força do time: {result.ev.expectedStage.toFixed(1)} · alcançado: {result.ev.stage} · pote {result.ev.pot}
          </span>
        </div>
        <Bar value={career.rep} />
        <p className="muted" style={{ marginBottom: 0 }}>
          {up ? 'Campanha acima do esperado para o seu time: o nome do técnico sobe.' : 'Campanha abaixo do esperado para o seu time: a reputação cai.'}
        </p>
      </div>
      <div style={{ marginTop: 12 }}>
        <CareerChoose
          title={`Convites (${career.offers?.length ?? 0})`}
          subtitle={career.offers?.length ? 'Seleções compatíveis com a sua reputação. Aceite um convite ou continue na atual.' : ''}
          ids={career.offers ?? []}
          onPick={onChoose}
        />
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="primary" onClick={onKeep}>Continuar com {nation?.country ?? 'a seleção atual'}</button>
        </div>
      </div>
    </div>
  );
}
