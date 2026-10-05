# Desenho dos saves

Decidido antes da Fase 7, para que o save/load seja só ligar peças.

## Versões

- `ENGINE_VERSION` (`src/engine/version.ts`): muda sempre que o comportamento do motor muda de propósito. Cada `MatchRecord` guarda a versão; `replayRecord` lança `EngineVersionError` se for outra. A UI deve cair para o relatório guardado da partida (a Fase 7 grava o relatório final junto) em vez de reproduzir.
- `data/golden-engine.txt` começa com `# engine-version N`. `npm run golden` falha se a versão do baseline e a do motor diferirem, e a mensagem manda subir `ENGINE_VERSION` e rodar `--update`. Assim, mudar o motor sem subir a versão é pego pelo CI.
- `SAVE_VERSION` (`src/save/file.ts`): versão do formato do arquivo. Mudou o esquema? Suba e escreva a migração em `migrate`. Save de versão mais nova que a do jogo é recusado.

## Camadas (`src/save`)

- `guards.ts`: valida cada tipo persistido e devolve só os campos conhecidos. Limites de tamanho, ids `^[A-Za-z0-9._:-]{1,64}$`, datas `aaaa-mm-dd`, cores `#rrggbb`, números finitos e dentro de faixa. Registros indexados por id (conquistas, desafio do dia) saem com protótipo nulo e rejeitam `__proto__`, `constructor` e `prototype`.
- `repository.ts`: `SaveRepository` lê sempre validado (dado corrompido ou adulterado vira `undefined`, o jogo segue como se não houvesse save) e grava JSON. `TextStore` abstrai o armazenamento: `LocalTextStore` (localStorage) hoje; a Fase 7 acrescenta uma implementação em IndexedDB para as Copas em andamento. Todo acesso ao localStorage passa por aqui (inclusive as configurações).
- `file.ts`: `exportSave` / `parseSave` / `applyImport`. O arquivo tem `format`, `version`, `engineVersion`, `exportedAt` e `data`. A importação recusa arquivo acima de 2 MB, JSON inválido, formato ou versão desconhecidos e qualquer campo inválido; chaves desconhecidas são ignoradas; `parseSave` aceita um verificador de seleções para recusar carreira que cite times inexistentes.

## Copa em andamento (Fase 7)

- **O que é salvo:** o `Tournament` inteiro (resultados, condição, estatísticas, partidas do usuário com os comandos gravados e, no draft, o time montado) mais o contexto do modo (desafio do dia, cenário, desafio de amigo). Chave `run` no repositório, validada por `src/save/run.ts` (uma estrutura inválida em qualquer ponto vira "sem Copa salva").
- **Quando:** a cada mudança do torneio (início, fim de cada rodada, cenário criado). Uma partida ao vivo não é salva no meio: ao continuar, ela recomeça do apito inicial com a mesma seed. Quando o resultado vira pontos, ranking e conquistas, a Copa salva é apagada.
- **Continuar:** a tela inicial mostra "Continuar: <seleção>" (e "Descartar"). A carreira continua guardada à parte (`career`).
- **Exportar e importar:** botões na tela inicial. O arquivo leva tudo (carreira, conquistas, ranking, desafios, cenários, nomes, Copa em andamento); a importação valida tudo, confere se as seleções existem, pede confirmação (substitui o progresso do navegador) e recusa arquivo inválido com mensagem.
- **Versão do motor:** o replay de uma partida guardada com outra `ENGINE_VERSION` lança `EngineVersionError`. O relatório final guardado para esse caso ainda não existe; hoje uma Copa em andamento de outra versão do motor continua, e só o replay das partidas antigas fica indisponível.
