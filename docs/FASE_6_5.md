# Fase 6.5: partida viva e decisões ao vivo

Resumo do que foi feito, como funciona e como foi medido.

## Regras de projeto mantidas

- **Determinismo:** seed + lista de comandos do usuário (relógio exato + comando) = mesma partida. `MatchSimulator.commands` guarda o log; `replayMatch` e `replayRecord` reproduzem a partida idêntica. Cada partida do usuário gera um `MatchRecord` (seed, escalações, condições e comandos), guardado em `Tournament.userMatches`, pronto para o save.
- **Motor passo a passo:** `playUntil(minuto)` avança até o relógio, o usuário age, o jogo continua. O motor para sozinho no intervalo e em cada decisão pendente.
- **Animação é só apresentação:** o coreógrafo (`src/ui/pitch/choreo.ts`) usa um PRNG próprio derivado da seed da partida e nunca devolve nada ao motor.
- **A IA usa os mesmos comandos:** gritos, mudança de formação, trocas, conversa de vestiário e tática, pelas mesmas funções do usuário (só não entram no log, porque são determinísticas).

## Comandos do motor (`MatchCommand`)

| Comando | Efeito | Custo / risco |
| --- | --- | --- |
| `sub` | Substituição (até 5) | Jogador novo entra com a condição dele |
| `tactics` | Formação, pressão, linha e ritmo | A tática tem custo e benefício (fadiga, espaço nas costas) |
| `shout` | Grito: pressionar, recuar, bola longa, toque curto. Vale 10 min, recarga de 10 | Pressionar e bola longa cansam mais; recuar cede o meio |
| `talk` | Conversa de vestiário no intervalo (motivar, cobrar, acalmar), uma vez por time | Usa o sorteio da partida: motivar 75% de acerto, cobrar 35% a 70% conforme o placar, acalmar 90% |
| `decide` | Resposta a um momento de decisão | Ver abaixo |

## Momentos de decisão (no máximo 3 pausas por partida)

| Momento | Quando | Escolhas |
| --- | --- | --- |
| Lesão | Sorteio por minuto, mais provável com cansaço | Trocar agora (com sugestões) ou manter o jogador, que rende 45% menos |
| Tudo ou nada | Perdendo após os 75' | Tudo ou nada (+10% ataque, -10% defesa, pressão e ritmo no máximo) ou segurar (+5% defesa, -3% ataque) |
| Pênalti a favor | Falta na área | Escolher o batedor (finalização e condição pesam) |
| Ordem dos batedores | Início da disputa de pênaltis (não conta nas 3 pausas) | Ordenar os batedores |

Sem resposta (simulação instantânea, "Sair"), o motor resolve com a escolha padrão e registra no log.

## Na tela

- **Coreógrafo:** 22 agentes em passo fixo de 1/60 s. Em 4x rodam mais passos por quadro, nunca passos maiores. Velocidade e aceleração vêm do atributo de velocidade reduzido pela fadiga; reação e antecipação vêm de posicionamento e passe.
- **Comportamentos:** portador conduz (drible limita a velocidade); só 1 ou 2 adversários pressionam, conforme a pressão da tática; atacantes infiltram em ciclos próprios; laterais apoiam conforme a linha; meias abrem triângulos; a linha defensiva sobe e desce junta, com atraso e erro de posicionamento por zagueiro; o goleiro acompanha a bola dentro da área.
- **Coerência com o motor:** quem finaliza chega ao ponto da área antes de receber a bola; o placar só muda quando a bola entra na rede.
- **Ritmo variável:** o relógio acelera sem perigo e desacelera nas jogadas de finalização; a narração cresce ("Hélio avança pela direita... levanta a bola na área... GOL!").
- **Gol:** câmera lenta no chute, rede balançando, tremida, faixa "GOL!" com autor, minuto e seleção, placar animado, confete nas cores do time e replay automático dos últimos 7,5 s (pulável).
- **Painel ao vivo:** momento dos últimos 10 minutos, xG acumulado, fadiga do time, finalizações. Jogadores cansados ou mal avaliados piscam no painel "Meu time"; clicar abre a troca rápida e pausa o jogo.
- **Depuração:** tecla **D** mostra o alvo e o vetor de velocidade de cada jogador.
- **Reduzir animações:** caixa no topo (padrão: preferência do sistema). Desliga câmera lenta, tremida, confete, replay automático e a aceleração do ritmo.

## Medidas (resultado de `npm test`, `npm run calibrate` e simulações)

| Critério | Resultado |
| --- | --- |
| Momentos que prendem a atenção por partida (gol, trave, defesa difícil, chance clara perdida, lesão, expulsão) | média 6,6; 97% dos jogos com pelo menos 3 |
| Tática trocada no intervalo (45' a 90', 500 jogos Brasil 70 x Alemanha Ocidental 80) | Ataque total: chutes a favor 9,4 para 10,8 e xG 0,93 para 1,09; retranca total: chutes a favor 9,4 para 8,0 e xG 0,93 para 0,80 |
| Correlação média da velocidade horizontal entre companheiros em 60 s | 0,53 (limite 0,7) |
| Quadros por segundo no Chrome a 4x | 60 fps, pior quadro 18 ms |
| Replay | Idêntico, incluindo gritos, conversa, trocas, lesões, pênaltis e ordem dos batedores (testes) |
