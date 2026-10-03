export function Home({ onNew, onLoad, canLoad }: { onNew: () => void; onLoad: () => void; canLoad: boolean }) {
  return (
    <div className="home">
      <h1>
        NOVO <span style={{ color: 'var(--accent)' }}>Football Manager</span>
      </h1>
      <p>
        Escolha uma seleção de uma era histórica, convoque, defina a tática e dispute uma Copa do Mundo. A força vem de resultados reais; os jogadores são todos fictícios.
      </p>
      <div className="row">
        <button className="primary" onClick={onNew}>
          Novo jogo
        </button>
        <button onClick={onLoad} disabled={!canLoad} title={canLoad ? '' : 'Nenhum save encontrado'}>
          Carregar save
        </button>
      </div>
    </div>
  );
}
