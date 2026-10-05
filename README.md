# NOVO Football Manager

Manager de seleções históricas que roda inteiro no navegador. Você escolhe uma seleção de uma era (por exemplo "Brasil anos 70" ou "Hungria 1954–57"), convoca, define a tática e disputa uma Copa do Mundo de 32 seleções, vendo as partidas em 2D com narração lance a lance.

- **Força real, elenco fictício:** a força de cada seleção-era vem de resultados históricos reais (Elo calculado de ~49 mil jogos). Os jogadores são 100% gerados, com nomes inventados e sem semelhança proposital com jogadores reais. Sem escudos de federações: só o nome do país e as cores.
- **Só cliente:** sem backend, cadastro, rede em runtime ou coleta de dados. O progresso fica no navegador (`localStorage`).
- **Motor determinístico:** mesma seed + mesmos comandos = mesma partida (replay idêntico).

## Modos de jogo

1. **Carreira de técnico:** comece com uma de 3 seleções fracas sorteadas e construa reputação Copa após Copa; depois de cada Copa chegam convites.
2. **Desafio do dia:** a data define a seed: todo mundo recebe a mesma seleção fraca e a mesma Copa; resultado compartilhável em texto.
3. **Monte a sua (draft):** sorteio de seleções-era, 1 jogador por rodada, 3 trocas de sorteio.
4. **Seleção pronta:** escolha uma das 841 seleções-era (décadas de 1930 a 2020 e gerações de 4 a 8 anos) e convoque 23.

Dentro da partida: gritos táticos, substituição rápida, intervalo com conversa de vestiário, momentos de decisão (lesão, "tudo ou nada", pênalti) e cobranças de pênalti em tela própria.

## Como rodar

Requisitos: Node 22 ou mais novo (o projeto usa o 24; veja `.nvmrc`) e Chrome no desktop.

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

| Comando | O que faz |
| --- | --- |
| `npm test` | Testes (motor, dados, torneio, carreira, pontuação, calibração) |
| `npm run typecheck` | Verificação de tipos (TypeScript estrito) |
| `npm run build` | Build de produção em `dist/` (com Content-Security-Policy) |
| `npm run build-world` | Recalcula `data/world.json` e `data/summaries.json` a partir de `data/raw/` (reproduz os mesmos arquivos) |
| `npm run calibrate` | Simula 20.000 jogos e confere gols por jogo, empates, curva de força e média por década |
| `npm run draft-balance` | Simula 1.000 drafts de um robô guloso: precisa ser campeão em menos de 40% das Copas |
| `npm run modes-balance` | Robô cumpre carreiras, desafios do dia e Copas comuns: curva de reputação, dificuldade e frequência das conquistas |
| `npm run golden` | Confere que o motor produz exatamente os mesmos resultados do baseline (refatorações seguras) |
| `npm run licenses` | Regera `THIRD_PARTY_NOTICES.md` |

## Estrutura

```
src/engine/   motor puro (sem DOM): partida, torneio, carreira, pontuação, desafio do dia; roda num Web Worker
src/data/     dados: Elo, seleções-era, gerador de elencos e nomes, draft
src/ui/       React (telas) e PixiJS (campo 2D e coreografia dos jogadores)
data/         world.json, summaries.json e os CSVs originais (data/raw)
scripts/      build-world, calibrate, tune, draft-balance, golden, licenses
docs/         plano, dados, calibração, fases e segurança
```

## Regras que o código respeita

- Nada de `Math.random` no motor: PRNG com seed (mulberry32); o log de comandos do usuário (relógio exato + comando) reproduz a partida.
- A animação é só apresentação: tem PRNG próprio e nunca altera o resultado.
- `npm test`, `npm run calibrate` e `npm run golden` precisam passar antes de qualquer mudança no motor; se o comportamento muda de propósito, `npm run golden -- --update`.

## Documentação

- [docs/PLANO.md](docs/PLANO.md): produto, motor, dados e riscos
- [docs/DADOS.md](docs/DADOS.md): fontes, licenças e como o mundo é gerado
- [docs/CALIBRACAO.md](docs/CALIBRACAO.md): metas, parâmetros finais e balanceamento do draft
- [docs/DESEMPENHO.md](docs/DESEMPENHO.md): medidas e limpeza
- [docs/SAVES.md](docs/SAVES.md): desenho dos saves (versões, validação, repositório)
- [docs/BALANCE_MODOS.md](docs/BALANCE_MODOS.md): balanceamento da carreira, do desafio do dia e das conquistas
- [docs/FASE_6_5.md](docs/FASE_6_5.md), [docs/FASE_6_7.md](docs/FASE_6_7.md): partida viva, modos de jogo e segurança
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): licenças de terceiros

## Segurança e privacidade

Sem rede em runtime e sem dados pessoais. O build traz uma Content-Security-Policy restritiva (`script-src 'self'`, sem `eval`, `connect-src 'self'`). Dependências: `npm audit` sem vulnerabilidades, integração contínua no GitHub Actions e Dependabot semanal.

## Dados e licenças

Os resultados vêm de [martj42/international_results](https://github.com/martj42/international_results), licença **CC0 1.0** (veja `data/raw/LICENSE-martj42-CC0.txt`). Todas as dependências de produção são MIT, BSD ou ISC.

**Licença do projeto:** ainda não definida pelo autor (sem arquivo `LICENSE`, todos os direitos reservados por padrão).
