import { ModeCards, type ModeHandlers } from './ModeSelect';

export function Home({ modes, onLoad, canLoad, onAchievements }: { modes: ModeHandlers; onLoad: () => void; canLoad: boolean; onAchievements: () => void }) {
  return (
    <div className="home">
      <h1>
        NOVO <span style={{ color: 'var(--accent)' }}>Football Manager</span>
      </h1>
      <p>
        Escolha uma seleção de uma era histórica, convoque, defina a tática e dispute uma Copa de 32 seleções. A força vem de resultados reais; os jogadores são todos fictícios.
      </p>
      <div style={{ textAlign: 'left', maxWidth: 900, margin: '0 auto 18px' }}>
        <ModeCards {...modes} />
      </div>
      <div className="row">
        <button className="ghost" onClick={onAchievements}>
          Conquistas e ranking
        </button>
        <button className="ghost" onClick={onLoad} disabled={!canLoad} title={canLoad ? '' : 'Nenhum save encontrado'}>
          Carregar save
        </button>
      </div>
      <p className="muted legal">
        Projeto de fãs, sem vínculo com a FIFA, confederações, federações ou jogadores. As seleções e épocas aparecem só como referência histórica (a força vem de resultados públicos); todos os jogadores são fictícios.
      </p>
    </div>
  );
}
