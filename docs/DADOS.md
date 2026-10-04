# Dados e licenças

## Fonte histórica

| Item | Valor |
| --- | --- |
| Base | [martj42/international_results](https://github.com/martj42/international_results) |
| Arquivos usados | `results.csv`, `shootouts.csv` (copiados em `data/raw/`) |
| Licença | **CC0 1.0 Universal** (domínio público), arquivo `LICENSE` na raiz do repositório; cópia em `data/raw/LICENSE-martj42-CC0.txt` |
| Baixado em | 3 de outubro de 2026 |
| SHA-256 `results.csv` | `df35268f8fc341ff7fb93d448b4e40356676ac35300a6b4461fd199a99ac1514` |
| SHA-256 `shootouts.csv` | `2acdc95fdad14f5f17200150a1a4a5fa6c2ccf57d31c8b4f61a2c7d9c0493113` |

O README do repositório não cita a origem dos resultados individuais; a CC0 cobre a compilação. Resultados de jogos são fatos. Mesmo sem exigência, a fonte é creditada aqui e em `data/world.json` (`generatedFrom`).

A Fjelstul World Cup Database (CC-BY-SA 4.0, com nomes reais) **não** é usada no produto.

## Como o mundo é gerado (`npm run build-world`)

1. **Elo:** todos os jogos em ordem cronológica, inicial 1500, estilo World Football Elo. K = 60 (Copa), 50 (finais continentais), 40 (eliminatórias e Nations League), 30 (outros), 20 (amistosos); multiplicador por saldo de gols; vantagem de mando de 100 pontos fora de campo neutro. Jogos sem placar são ignorados.
2. **Seleção-era:** toda seleção da tabela de países (`src/data/countries.ts`, 72 países) com no mínimo **15 jogos na década**, de **1930 a 2020**. O Elo da era é a média do Elo pré-jogo na década. Os nomes do CSV são os nomes atuais; o jogo usa o nome da época (ex.: "União Soviética", "Alemanha Ocidental").
3. **Quantas saem:** com o mínimo de 15 jogos saem **561 seleções-era** (33 em 1930, 35 em 1940, 45 em 1950, 60 em 1960, 63 em 1970 e 1980, 67 em 1990, 65 em 2000, 2010 e 2020). O critério é ajustável: `npm run build-world -- --min=20` regera com outro mínimo e o script informa quantas saíram; o teste `data.test.ts` confere que um mínimo maior gera menos seleções-era.
4. **Dados de cada seleção-era:** força (`elo` e `strength = 10^((elo - 1800) / 400)`), estilo de jogo, gols marcados e sofridos por jogo na década, continente, cores, cultura dos nomes e jogos na amostra.
5. **Estilo de jogo:** abertura (gols totais dos jogos da seleção contra a média da década) e domínio (fatia dos gols a favor).
6. **Média de gols por década:** na base inteira e só em jogos entre seleções com Elo >= 1650 (`goalsPerMatchCompetitive`, a referência da calibração).
7. **Elencos sob demanda:** o `world.json` (cerca de 150 KB) guarda **só dados de seleção**. Os ~40 jogadores de cada seleção-era são gerados na hora por `squadOf()` (`src/data/squads.ts`), com seed fixa `squad:<id>`: o elenco é sempre o mesmo. Nomes inventados por cultura (prenome genérico + sobrenome montado por sílabas), nível ligado ao Elo e estilos coerentes com a década.

O `data/world.json` é versionado; rodar `npm run build-world` de novo reproduz o mesmo arquivo (há teste para isso). O jogo nunca acessa a rede.
