Você vai construir o MVP jogável do "NOVO Football Manager" neste fim de semana. Leia docs/PLANO.md antes de começar: é a referência de produto, motor, dados e riscos. Onde este prompt e o plano divergirem, vale este prompt (é o recorte do fim de semana).

## Objetivo
Um manager de seleções históricas jogável no Chrome (desktop) do início ao fim: escolher uma seleção-era (ex.: "Brasil anos 70"), convocar, definir tática e disputar uma Copa com grupos e mata-mata, vendo as partidas em 2D com narração lance a lance.

## Regras não negociáveis
- Só cliente: Vite + TypeScript. Sem backend, cadastro, chat, compras, analytics ou chamadas de rede em runtime.
- Força real, elenco fictício: a força de cada seleção-era vem de resultados históricos reais; os jogadores são 100% gerados, com nomes inventados por nacionalidade e sem semelhança proposital com jogadores reais (nada de "Pelê"). Sem escudos de federações: só o nome do país e as cores nacionais.
- Jogadores identificados por estilo coerente com a era ("ponta driblador", "camisa 10 cerebral", "líbero clássico").
- Motor determinístico: mesma seed + mesmas escalações = mesma partida. Proibido Math.random no motor; use PRNG com seed (ex.: mulberry32).
- Motor como módulo puro em src/engine, sem DOM, executado num Web Worker.

## Stack
- Vite + TypeScript estrito, React para as telas, PixiJS v8 para o campo 2D, Vitest para testes.
- Persistência: IndexedDB atrás de uma interface SaveRepository (o destino futuro é SQLite WASM). Botões de exportar/importar o save em JSON.

## Dados históricos
- Baixe results.csv e shootouts.csv de github.com/martj42/international_results para data/raw/. Confirme a licença no repositório e registre-a em docs/DADOS.md. Não use a Fjelstul World Cup Database no produto.
- `npm run build-world`: calcula o Elo de cada seleção ao longo do tempo e o Elo médio por década (1950 a 2020); escolhe 32 seleções-era equilibradas entre décadas e continentes; gera data/world.json com força, estilo de jogo e média de gols da década. O world.json fica versionado no repositório; o jogo nunca acessa a rede.
- Gerador de elencos com seed fixa: ~40 jogadores por seleção-era, com posição, idade, atributos e estilo coerentes com a força e a era.

## Motor de partida
1. Duelos por p = A^k / (A^k + B^k), k configurável (começar em 2). Nunca comparação do tipo A > rand(0, B).
2. Posse avança por zonas (defesa → meio → último terço → finalização); transições dependem da força dos setores e da tática; a perda de posse entrega a bola ao adversário na zona correspondente.
3. Cada finalização tem tipo (jogada trabalhada, contra-ataque, cruzamento, bola parada, pênalti) e xG base; conversão = xG ajustado por finalizador vs goleiro.
4. Tática: formação (4-4-2, 4-3-3, 3-5-2, 5-4-1) + controles de pressão, altura da linha e ritmo, cada um com custo e benefício (pressão alta recupera mais e cansa mais; linha alta expõe a bola longa).
5. Eventos atribuídos a jogadores (passe decisivo, finalização, defesa, falta, cartão) e nota de 0 a 10 por jogador.
6. Fadiga dentro da partida e entre jogos do torneio; até 5 substituições; pênaltis no mata-mata.
7. Saída: MatchReport com placar, eventos minuto a minuto (incluindo a zona da bola), posse, finalizações, xG e notas.

## Calibração
- `npm run calibrate`: simula 20.000 jogos em campo neutro entre seleções-era sorteadas e imprime gols/jogo, % de empates, xG médio e % de vitória do mais forte por faixa de diferença de força.
- Alvos: 2,5 a 2,8 gols por jogo no geral; 23% a 28% de empates; o mais forte vence mais vezes, mas zebras precisam existir em todas as faixas; entre seleções da mesma década, a média de gols deve ficar a até 0,3 da média real daquela década calculada no build-world.
- Ajuste os parâmetros até atingir os alvos e registre os valores finais em docs/CALIBRACAO.md.
- Testes Vitest: determinismo por seed e alvos de calibração com 5.000 jogos.

## Telas
1. Início: novo jogo ou carregar save.
2. Escolha da seleção-era (32, mostrando década, força e estilo).
3. Convocação: 23 de um pool de ~40, com posição, idade, estilo, atributos e condição.
4. Tática: formação, controles e titulares.
5. Copa: 8 grupos de 4, os 2 primeiros avançam, depois oitavas até a final; tabelas e chaveamento.
6. Partida: campo 2D com a bola entre zonas, placar, relógio e narração; velocidades 1x, 4x e instantâneo; pausa para substituir ou mudar a tática.
7. Pós-jogo com estatísticas, xG e notas; fim da Copa com campeão, artilheiro e melhor jogador, e opção de nova Copa.
As outras 31 seleções usam IA simples: escalam os melhores com condição alta, ficam ofensivas se perdem após os 70' e defensivas se vencem após os 80'.

## Fora de escopo
Backend, contas, ligas multiplayer, mercado, finanças, clubes, liga feminina, modo draft, nomes reais, 3D, áudio, mobile, PWA, lojas e monetização.

## Ordem de trabalho (um commit ao fim de cada etapa, com testes rodando)
1. Scaffold, PRNG e tipos.
2. Dados históricos: build-world e gerador de elencos.
3. Motor e testes de determinismo.
4. Calibração até os alvos.
5. Fluxo completo de telas com resultados instantâneos.
6. Visualizador 2D e narração.
7. Save/load, polimento e README explicando como rodar.
Ao fim de cada etapa, me mostre um resumo curto do que mudou e o que testar.

## Pronto quando
`npm install && npm run dev` abre no Chrome, consigo jogar uma Copa inteira em menos de 40 minutos sem erros no console, e `npm test`, `npm run calibrate` e `npm run build-world` passam (o último reproduzindo o mesmo data/world.json).
