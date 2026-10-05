export interface ModeHandlers {
  onCareer: () => void;
  hasCareer: boolean;
  onDaily: () => void;
  dailyDone: boolean;
  onDraft: () => void;
  onReady: () => void;
  onScenarios: () => void;
  scenariosDone: number;
}

/** Os modos, na ordem da tela inicial: Carreira, Desafio do dia, Cenários, Draft, Seleção pronta. */
export function ModeCards({ onCareer, hasCareer, onDaily, dailyDone, onDraft, onReady, onScenarios, scenariosDone }: ModeHandlers) {
  return (
    <div className="choices modes">
      <button onClick={onCareer}>
        <b>Carreira de técnico{hasCareer ? ' (em andamento)' : ''}</b>
        <span>Comece com uma de 3 seleções fracas sorteadas e construa reputação Copa após Copa. Campanhas acima do esperado para a força do time sobem a reputação; fracassos derrubam. Depois de cada Copa, chegam convites de seleções à altura do seu nome.</span>
      </button>
      <button onClick={onDaily}>
        <b>Desafio do dia{dailyDone ? ' (já jogado hoje)' : ''}</b>
        <span>A data define a seed: todo mundo recebe a mesma seleção fraca e a mesma Copa. No fim, um resultado em texto, no estilo Wordle, para compartilhar. Sem rede e sem dados pessoais.</span>
      </button>
      <button onClick={onScenarios}>
        <b>Cenários (uma partida){scenariosDone ? ` · ${scenariosDone} jogados` : ''}</b>
        <span>Uma partida só contra uma seleção de outra época: o Uruguai contra o Brasil, os Estados Unidos contra o Brasil de 70, o Brasil de 70 contra o de hoje. Cinco minutos, o mesmo jogo para todo mundo, e um link para desafiar um amigo.</span>
      </button>
      <button onClick={onDraft}>
        <b>Monte a sua (draft por sorteio)</b>
        <span>Defina nome, cores e formação. A cada rodada o jogo sorteia uma seleção-era, com a mesma chance para todas, e você escolhe 1 jogador dela. São 3 trocas de sorteio. Seleções fracas aparecem muito: é preciso decidir se vale esperar um craque.</span>
      </button>
      <button onClick={onReady}>
        <b>Seleção pronta</b>
        <span>Escolha uma seleção-era (por exemplo, "Brasil anos 70" ou "Hungria 1954–57"), com busca por década, continente e força, e convoque 23 do elenco dela.</span>
      </button>
    </div>
  );
}
