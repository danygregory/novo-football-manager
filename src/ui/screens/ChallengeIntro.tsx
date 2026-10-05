import { nationsById } from '../world';
import { TeamCard } from './Career';

/** Tela de quem abriu um link de desafio: mesma seleção, mesmo recorte e mesma seed do amigo. */
export function ChallengeIntro({ nationId, cut, points, stage, onPlay, onBack }: { nationId: string; cut: string | number; points?: number; stage?: string; onPlay: () => void; onBack: () => void }) {
  const team = nationsById.get(nationId);
  if (!team) return null;
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h2>Desafio de um amigo</h2>
          <div className="muted">
            {points !== undefined ? <>Ele fez <b className="mvp">{points} pts</b>{stage ? <> ({stage})</> : null} com esta seleção. </> : null}
            Você joga a mesma Copa: mesmas seleções, grupos e chaveamento ({cut === 'all' ? 'todas as eras' : `só seleções dos anos ${String(cut).slice(2)}`}). Monte o elenco e a tática do seu jeito e tente superar.
          </div>
        </div>
        <button className="ghost" onClick={onBack}>Início</button>
      </div>
      <div className="cols">
        <TeamCard n={team} label="Aceitar o desafio" onPick={onPlay} />
      </div>
    </div>
  );
}
