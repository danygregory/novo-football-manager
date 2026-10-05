# Desempenho e limpeza

Auditoria de código: medir antes de mexer, provar depois que o comportamento não mudou.

## Medidas

| O que | Antes | Depois |
| --- | --- | --- |
| JavaScript inicial (`index-*.js`) | 1.221 KB (287 KB gzip) | **637 KB (159 KB gzip)** |
| Worker do motor | 596 KB | **317 KB** |
| Pixi (campo 2D) | dentro do inicial | **298 KB à parte, baixado na 1ª partida ao vivo** |
| Resumos factuais das seleções | dentro do `world.json` (e do worker) | **283 KB à parte (`summaries.json`), baixados só ao ver os detalhes de uma seleção** |
| `world.json` | 577 KB | **309 KB** |
| `npm run calibrate` (30.000 jogos) | 16,9 s | **14,4 s** |
| Motor (partida completa) | ~0,37 ms | ~0,31 ms (estimado pelo calibrate) |
| Coreografia (22 agentes) | 7,7 µs por passo fixo (0,6 ms por segundo a 4x) | sem mudança: já era desprezível |

O gargalo de tempo real não é o motor (menos de 0,4 ms por jogo) nem a coreografia: era o tamanho do que o navegador baixa e interpreta antes da primeira tela.

## O que mudou

- **Carga sob demanda:** o Pixi (`PitchView`) e os resumos (`summaries.json`) viram arquivos separados. O jogo só pede o Pixi quando abre uma partida ao vivo (o relógio espera o campo ficar pronto) e só pede os resumos quando mostra os detalhes de uma seleção.
- **Motor:** a fadiga por minuto calculava a tática efetiva uma vez por jogador; agora uma vez por time. A qualidade por setor e o encaixe na posição de cada jogador são guardados (só mudam quando muda a posição ou o jogador).
- **Time do draft:** `withCustom` guarda o mundo derivado em cache em vez de recopiar as 800+ seleções a cada chamada.
- **Duplicação removida:** `clamp` (4 cópias, agora `src/engine/util.ts`), tabelas de estatísticas e ícones de eventos (agora em `components/common.tsx`).
- **Código morto removido:** `ballPosition`, `POS_LABEL`, `playerName`, CSS de cartões de seleção antigos (`.nation-card`, `.grid-nations`, `.attr-cell`, `.flash.soft`); `recoverCondition` passou a ser usada em vez de repetida no torneio.

## Como se provou que nada mudou

`npm run golden` simula 120 partidas (com e sem comandos, mata-mata, detalhe completo e resumo) e compara o hash de cada relatório com o baseline em `data/golden-engine.txt`. Depois de todas as mudanças: **120 de 120 idênticas**, e a calibração dá exatamente os mesmos números (2,64 gols por jogo, 24,6% de empates). Se o motor for alterado de propósito, `npm run golden -- --update` grava o novo baseline.

## O que ficou como está (e por quê)

- `src/engine/match.ts` (1.360 linhas) e `LiveMatch.tsx` (700 linhas) são grandes, mas coesos; dividir agora traria risco sem ganho de desempenho.
- A interface renderiza a cada 90 ms durante a partida: custo desprezível (60 fps medidos).
- Os exports só usados dentro do próprio arquivo (tipos e constantes) são inofensivos e documentam a API.
