import { useMemo, useState } from 'react';
import type { Continent, Decade, NationEra } from '../../engine/types';
import { squadOf } from '../../data/squads';
import { useSummary } from '../summaries';
import { eraSpan, world } from '../world';
import { Bar, Kit, STYLE_LABEL, rowActivate } from '../components/common';

const CONTINENT_LABEL: Record<Continent, string> = { EU: 'Europa', SA: 'América do Sul', NA: 'América do Norte/Central', AF: 'África', AS: 'Ásia', OC: 'Oceania' };
const DECADES: Decade[] = [1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

/** Faixas de força (Elo médio da década). */
const TIERS: { key: string; label: string; min: number; max: number }[] = [
  { key: 'all', label: 'Qualquer força', min: 0, max: 9999 },
  { key: 'elite', label: 'Elite (Elo 1900 ou mais)', min: 1900, max: 9999 },
  { key: 'strong', label: 'Forte (1750 a 1899)', min: 1750, max: 1900 },
  { key: 'mid', label: 'Média (1600 a 1749)', min: 1600, max: 1750 },
  { key: 'weak', label: 'Fraca (abaixo de 1600)', min: 0, max: 1600 },
];

type Sort = 'elo' | 'decade' | 'name';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function PickNation({ initial, onPick, onBack }: { initial?: string; onPick: (id: string) => void; onBack: () => void }) {
  const [sel, setSel] = useState<string | undefined>(initial);
  const [query, setQuery] = useState('');
  const [decade, setDecade] = useState<'all' | Decade>('all');
  const [continent, setContinent] = useState<'all' | Continent>('all');
  const [tier, setTier] = useState('all');
  const [sort, setSort] = useState<Sort>('elo');
  const [kind, setKind] = useState<'all' | 'decade' | 'peak'>('all');

  const rows = useMemo(() => {
    const t = TIERS.find((x) => x.key === tier) ?? TIERS[0]!;
    const q = norm(query.trim());
    const list = world.nations.filter(
      (n) =>
        (decade === 'all' || n.decade === decade) &&
        (continent === 'all' || n.continent === continent) &&
        (kind === 'all' || n.kind === kind) &&
        n.elo >= t.min &&
        n.elo < t.max &&
        (!q || norm(n.country).includes(q) || String(n.decade).includes(q) || n.span.some((y) => String(y).includes(q))),
    );
    list.sort((a, b) => (sort === 'elo' ? b.elo - a.elo : sort === 'decade' ? a.decade - b.decade || b.elo - a.elo : norm(a.country).localeCompare(norm(b.country)) || a.decade - b.decade));
    return list;
  }, [query, decade, continent, tier, sort, kind]);

  const chosen = sel ? world.nations.find((n) => n.id === sel) : undefined;
  const rank = chosen ? 1 + world.nations.filter((n) => n.kind === 'decade' && n.decade === chosen.decade && n.elo > chosen.elo).length : 0;
  const inDecade = chosen ? world.nations.filter((n) => n.kind === 'decade' && n.decade === chosen.decade).length : 0;

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>Escolha sua seleção</h2>
          <div className="muted">{world.nations.length} seleções-era de 1930 a 2020: décadas e gerações (picos de 4 a 8 anos). A força é o Elo médio do período, calculado de resultados reais; "na época" compara com as outras seleções da mesma década.</div>
        </div>
        <div className="row">
          <button className="ghost" onClick={onBack}>Voltar</button>
          <button className="primary" disabled={!sel} onClick={() => sel && onPick(sel)}>Escolher</button>
        </div>
      </div>

      <div className="filters panel">
        <input type="search" placeholder="Buscar por país ou década" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar" />
        <select value={decade} onChange={(e) => setDecade(e.target.value === 'all' ? 'all' : (Number(e.target.value) as Decade))} aria-label="Década">
          <option value="all">Todas as décadas</option>
          {DECADES.map((d) => <option key={d} value={d}>Anos {String(d).slice(2)} ({d})</option>)}
        </select>
        <select value={continent} onChange={(e) => setContinent(e.target.value as 'all' | Continent)} aria-label="Continente">
          <option value="all">Todos os continentes</option>
          {(Object.keys(CONTINENT_LABEL) as Continent[]).map((c) => <option key={c} value={c}>{CONTINENT_LABEL[c]}</option>)}
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Força">
          {TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as 'all' | 'decade' | 'peak')} aria-label="Tipo">
          <option value="all">Décadas e gerações</option>
          <option value="decade">Só décadas</option>
          <option value="peak">Só gerações (picos de 4 a 8 anos)</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar">
          <option value="elo">Mais fortes primeiro</option>
          <option value="decade">Por década</option>
          <option value="name">Por nome</option>
        </select>
        <span className="muted">{rows.length} seleções-era</span>
      </div>

      {chosen && <PickDetail nation={chosen} rank={rank} inDecade={inDecade} />}

      <div className="panel pick-list" style={{ padding: 0 }}>
        <table className="pick-table">
          <thead>
            <tr><th>Seleção</th><th>Período</th><th>Continente</th><th>Estilo</th><th className="num">Elo</th><th style={{ width: 150 }}>Na época</th></tr>
          </thead>
          <tbody>
            {rows.map((n: NationEra) => (
              <tr key={n.id} className={`clickable ${sel === n.id ? 'called' : ''}`} {...rowActivate(() => setSel(n.id), sel === n.id)} onDoubleClick={() => onPick(n.id)}>
                <td><Kit nation={n} />{n.country}</td>
                <td>{eraSpan(n)}</td>
                <td className="muted">{CONTINENT_LABEL[n.continent]}</td>
                <td className="muted">{STYLE_LABEL[n.playStyle]}</td>
                <td className="num"><b>{Math.round(n.elo)}</b></td>
                <td title={`Top ${100 - n.percentile + 1}% da década de ${n.decade}`}><Bar value={n.percentile} max={100} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma seleção-era com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PickDetail({ nation, rank, inDecade }: { nation: NationEra; rank: number; inDecade: number }) {
  const star = useMemo(() => squadOf(nation).find((p) => p.star), [nation]);
  const summary = useSummary(nation);
  return (
    <div className="panel pick-detail">
      <div className="row between">
        <div><Kit nation={nation} /><b>{nation.country}</b> · {eraSpan(nation)}{nation.kind === 'peak' ? ' · geração' : ''}</div>
        <div className="row">
          <span className="chip accent">Elo {Math.round(nation.elo)} (usado no jogo)</span>
          <span className="chip">top {100 - nation.percentile + 1}% da década de {nation.decade}</span>
          {nation.kind === 'decade' && <span className="chip">{rank}ª de {inDecade}</span>}
        </div>
      </div>
      <div className="muted" style={{ margin: '4px 0' }}>{CONTINENT_LABEL[nation.continent]} · estilo {STYLE_LABEL[nation.playStyle]} · gols {nation.goalsFor.toFixed(2)} marcados e {nation.goalsAgainst.toFixed(2)} sofridos por jogo</div>
      {star && (
        <div style={{ margin: '4px 0' }}>
          ⭐ Craque: <b>{star.name}</b> ({star.slot}, {star.age} anos), <b>{star.trait}</b>
        </div>
      )}
      <p className="muted" style={{ margin: '4px 0 0', fontSize: '.88rem' }}>{summary}</p>
    </div>
  );
}
