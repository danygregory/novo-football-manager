import { useState } from 'react';
import type { DailyRecord } from '../../engine/daily';
import type { NationEra } from '../../engine/types';
import { TeamCard } from './Career';

export function DailyIntro({ date, team, best, onPlay, onBack }: { date: string; team: NationEra; best?: DailyRecord; onPlay: () => void; onBack: () => void }) {
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>Desafio do dia · {date}</h2>
          <div className="muted">Todos recebem a mesma seleção fraca e a mesma Copa (adversários da mesma época, grupos e chaveamento). Dá para jogar de novo; vale o melhor resultado do dia.</div>
        </div>
        <button className="ghost" onClick={onBack}>Voltar</button>
      </div>
      <div className="cols">
        <TeamCard n={team} label="Jogar o desafio" onPick={onPlay} />
        <div className="panel">
          <h3>Seu resultado de hoje</h3>
          {best ? (
            <>
              <div className="row between"><b>{best.champion ? '🏆 ' : ''}{best.stageText}</b><span className="mvp">{best.points} pts</span></div>
              <pre className="share">{best.text}</pre>
              <CopyButton text={best.text} />
            </>
          ) : (
            <p className="muted">Você ainda não jogou o desafio de hoje. No fim, aparece um resultado em texto, no estilo Wordle, para compartilhar. Ele não leva nenhum dado pessoal.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('ok');
    } catch {
      // sem permissão da área de transferência: seleciona o texto para copiar à mão
      const el = document.querySelector<HTMLElement>('.share');
      if (el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
      setState('err');
    }
  };
  return (
    <button onClick={() => void copy()}>
      {state === 'ok' ? 'Copiado!' : state === 'err' ? 'Selecionado: use Ctrl/Cmd+C' : 'Copiar resultado'}
    </button>
  );
}

export function DailyShare({ record }: { record: DailyRecord }) {
  return (
    <div className="panel" style={{ textAlign: 'left', margin: '14px 0' }}>
      <h3>Resultado para compartilhar</h3>
      <pre className="share">{record.text}</pre>
      <div className="row">
        <CopyButton text={record.text} />
        <span className="muted" style={{ fontSize: '.85rem' }}>Só tem a data, a seleção do dia e a campanha. Nada sai do seu navegador.</span>
      </div>
    </div>
  );
}
