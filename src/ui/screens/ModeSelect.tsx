export function ModeSelect({ onCareer, hasCareer, onReady, onDraft, onBack }: { onCareer: () => void; hasCareer: boolean; onReady: () => void; onDraft: () => void; onBack: () => void }) {
  return (
    <div>
      <div className="row between" style={{ marginBottom: 14 }}>
        <div>
          <h2>Como você quer montar o time?</h2>
          <div className="muted">Os dois modos jogam a mesma Copa do Mundo.</div>
        </div>
        <button className="ghost" onClick={onBack}>Voltar</button>
      </div>
      <div className="choices modes">
        <button onClick={onCareer}>
          <b>Carreira de técnico{hasCareer ? ' (em andamento)' : ''}</b>
          <span>Comece com uma de 3 seleções fracas sorteadas e construa reputação Copa após Copa. Campanhas acima do esperado para a força do time sobem a reputação; fracassos derrubam. Depois de cada Copa, chegam convites de seleções à altura do seu nome.</span>
        </button>
        <button onClick={onReady}>
          <b>Seleção pronta</b>
          <span>Escolha uma seleção-era (por exemplo, "Brasil anos 70"), com busca por década, continente e força, e convoque 23 do elenco dela.</span>
        </button>
        <button onClick={onDraft}>
          <b>Monte a sua (draft por sorteio)</b>
          <span>Defina nome, cores e formação. A cada rodada o jogo sorteia uma seleção-era, com a mesma chance para todas, e você escolhe 1 jogador dela. São 3 trocas de sorteio. Seleções fracas aparecem muito: é preciso decidir se vale esperar um craque.</span>
        </button>
      </div>
    </div>
  );
}
