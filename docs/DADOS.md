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
2. **Seleção-era:** Elo médio (pré-jogo) da seleção na década, com mínimo de 15 jogos. Os nomes do CSV são os nomes atuais; Alemanha, Rússia e outros usam o nome da época no jogo (ex.: "União Soviética").
3. **Escolha das 32:** 4 por década (de 1950 a 2020), uma de topo, uma vice, uma intermediária e uma fraca, com cotas por continente (EU 11, SA 6, AF 5, AS 5, NA 4, OC 1) e no máximo 2 por país.
4. **Força:** `strength = 10^((elo - 1800) / 400)`.
5. **Estilo de jogo:** abertura (gols totais dos jogos da seleção contra a média da década) e domínio (fatia dos gols a favor).
6. **Média de gols:** por década na base inteira e só em jogos entre seleções com Elo >= 1650 (`goalsPerMatchCompetitive`, a referência da calibração).
7. **Elencos:** 40 jogadores por seleção-era, gerados com seed fixa (`squad:<id>`), nomes inventados por cultura (prenome genérico + sobrenome montado por sílabas), nível ligado ao Elo e estilos coerentes com a década.

O `data/world.json` é versionado; rodar `npm run build-world` de novo reproduz o mesmo arquivo (há teste para isso). O jogo nunca acessa a rede.
