import type { Continent, Decade } from '../engine/types';

export type Culture =
  | 'portugues'
  | 'espanhol'
  | 'italiano'
  | 'germanico'
  | 'frances'
  | 'ingles'
  | 'neerlandes'
  | 'eslavo'
  | 'magiar'
  | 'balcanico'
  | 'nordico'
  | 'arabe'
  | 'africano'
  | 'japones'
  | 'coreano'
  | 'chines';

export interface CountryMeta {
  code: string;
  /** Nome exato usado no results.csv. */
  dataName: string;
  /** Nome em português (padrão). */
  name: string;
  continent: Continent;
  culture: Culture;
  colors: [string, string];
  /** Nomes alternativos por era: [até a década (inclusive), nome]. */
  eraNames?: [Decade, string][];
  /** Continente por era, quando mudou (ex.: Austrália). */
  continentFrom?: [Decade, Continent][];
}

const c = (
  code: string,
  dataName: string,
  name: string,
  continent: Continent,
  culture: Culture,
  p: string,
  s: string,
  extra: Partial<CountryMeta> = {},
): CountryMeta => ({ code, dataName, name, continent, culture, colors: [p, s], ...extra });

export const COUNTRIES: CountryMeta[] = [
  // Europa
  c('ENG', 'England', 'Inglaterra', 'EU', 'ingles', '#ffffff', '#c8102e'),
  c('GER', 'Germany', 'Alemanha', 'EU', 'germanico', '#ffffff', '#111111', { eraNames: [[1980, 'Alemanha Ocidental']] }),
  c('GDR', 'German DR', 'Alemanha Oriental', 'EU', 'germanico', '#ffffff', '#dd0000'),
  c('FRA', 'France', 'França', 'EU', 'frances', '#1e40af', '#ffffff'),
  c('ITA', 'Italy', 'Itália', 'EU', 'italiano', '#0b5ed7', '#ffffff'),
  c('ESP', 'Spain', 'Espanha', 'EU', 'espanhol', '#c60b1e', '#ffc400'),
  c('NED', 'Netherlands', 'Holanda', 'EU', 'neerlandes', '#ff6f00', '#ffffff'),
  c('POR', 'Portugal', 'Portugal', 'EU', 'portugues', '#006600', '#d00000'),
  c('BEL', 'Belgium', 'Bélgica', 'EU', 'frances', '#e30613', '#111111'),
  c('HUN', 'Hungary', 'Hungria', 'EU', 'magiar', '#ce2939', '#ffffff'),
  c('URS', 'Russia', 'Rússia', 'EU', 'eslavo', '#cc0000', '#ffffff', { eraNames: [[1980, 'União Soviética']] }),
  c('YUG', 'Yugoslavia', 'Iugoslávia', 'EU', 'balcanico', '#1d4ed8', '#ffffff'),
  c('SRB', 'Serbia', 'Sérvia', 'EU', 'balcanico', '#c6363c', '#0c4076'),
  c('TCH', 'Czechoslovakia', 'Tchecoslováquia', 'EU', 'eslavo', '#d7141a', '#11457e'),
  c('CZE', 'Czech Republic', 'Tchéquia', 'EU', 'eslavo', '#d7141a', '#ffffff'),
  c('SWE', 'Sweden', 'Suécia', 'EU', 'nordico', '#ffcd00', '#006aa7'),
  c('DEN', 'Denmark', 'Dinamarca', 'EU', 'nordico', '#c60c30', '#ffffff'),
  c('NOR', 'Norway', 'Noruega', 'EU', 'nordico', '#ba0c2f', '#00205b'),
  c('SCO', 'Scotland', 'Escócia', 'EU', 'ingles', '#00205b', '#ffffff'),
  c('WAL', 'Wales', 'País de Gales', 'EU', 'ingles', '#c8102e', '#ffffff'),
  c('IRL', 'Republic of Ireland', 'Irlanda', 'EU', 'ingles', '#169b62', '#ffffff'),
  c('AUT', 'Austria', 'Áustria', 'EU', 'germanico', '#ed2939', '#ffffff'),
  c('SUI', 'Switzerland', 'Suíça', 'EU', 'germanico', '#d52b1e', '#ffffff'),
  c('POL', 'Poland', 'Polônia', 'EU', 'eslavo', '#ffffff', '#dc143c'),
  c('ROU', 'Romania', 'Romênia', 'EU', 'balcanico', '#fcd116', '#002b7f'),
  c('BUL', 'Bulgaria', 'Bulgária', 'EU', 'eslavo', '#ffffff', '#00966e'),
  c('CRO', 'Croatia', 'Croácia', 'EU', 'balcanico', '#ffffff', '#c8102e'),
  c('GRE', 'Greece', 'Grécia', 'EU', 'balcanico', '#0d5eaf', '#ffffff'),
  c('TUR', 'Turkey', 'Turquia', 'EU', 'balcanico', '#e30a17', '#ffffff'),
  c('UKR', 'Ukraine', 'Ucrânia', 'EU', 'eslavo', '#ffd500', '#005bbb'),
  // América do Sul
  c('BRA', 'Brazil', 'Brasil', 'SA', 'portugues', '#ffdf00', '#009c3b'),
  c('ARG', 'Argentina', 'Argentina', 'SA', 'espanhol', '#74acdf', '#ffffff'),
  c('URU', 'Uruguay', 'Uruguai', 'SA', 'espanhol', '#5eb6e4', '#111111'),
  c('CHI', 'Chile', 'Chile', 'SA', 'espanhol', '#d52b1e', '#0039a6'),
  c('COL', 'Colombia', 'Colômbia', 'SA', 'espanhol', '#fcd116', '#003893'),
  c('PAR', 'Paraguay', 'Paraguai', 'SA', 'espanhol', '#d52b1e', '#0038a8'),
  c('PER', 'Peru', 'Peru', 'SA', 'espanhol', '#ffffff', '#d91023'),
  c('ECU', 'Ecuador', 'Equador', 'SA', 'espanhol', '#ffdd00', '#034ea2'),
  // América do Norte/Central
  c('MEX', 'Mexico', 'México', 'NA', 'espanhol', '#006847', '#ce1126'),
  c('USA', 'United States', 'Estados Unidos', 'NA', 'ingles', '#ffffff', '#0a3161'),
  c('CRC', 'Costa Rica', 'Costa Rica', 'NA', 'espanhol', '#d52b1e', '#002b7f'),
  c('HON', 'Honduras', 'Honduras', 'NA', 'espanhol', '#0073cf', '#ffffff'),
  c('JAM', 'Jamaica', 'Jamaica', 'NA', 'ingles', '#fed100', '#009b3a'),
  c('CAN', 'Canada', 'Canadá', 'NA', 'ingles', '#d52b1e', '#ffffff'),
  c('CUB', 'Cuba', 'Cuba', 'NA', 'espanhol', '#cf142b', '#002a8f'),
  c('SLV', 'El Salvador', 'El Salvador', 'NA', 'espanhol', '#0f47af', '#ffffff'),
  // África
  c('EGY', 'Egypt', 'Egito', 'AF', 'arabe', '#ce1126', '#ffffff'),
  c('NGA', 'Nigeria', 'Nigéria', 'AF', 'africano', '#008751', '#ffffff'),
  c('CMR', 'Cameroon', 'Camarões', 'AF', 'africano', '#007a5e', '#ce1126'),
  c('GHA', 'Ghana', 'Gana', 'AF', 'africano', '#fcd116', '#006b3f'),
  c('SEN', 'Senegal', 'Senegal', 'AF', 'africano', '#00853f', '#fdef42'),
  c('MAR', 'Morocco', 'Marrocos', 'AF', 'arabe', '#c1272d', '#006233'),
  c('ALG', 'Algeria', 'Argélia', 'AF', 'arabe', '#ffffff', '#006233'),
  c('TUN', 'Tunisia', 'Tunísia', 'AF', 'arabe', '#e70013', '#ffffff'),
  c('CIV', 'Ivory Coast', 'Costa do Marfim', 'AF', 'africano', '#f77f00', '#009e60'),
  c('COD', 'DR Congo', 'RD Congo', 'AF', 'africano', '#00a1de', '#f7d618', { eraNames: [[1990, 'Zaire']] }),
  c('RSA', 'South Africa', 'África do Sul', 'AF', 'ingles', '#ffb612', '#007749'),
  c('MLI', 'Mali', 'Mali', 'AF', 'africano', '#14b53a', '#fcd116'),
  // Ásia / Oceania
  c('JPN', 'Japan', 'Japão', 'AS', 'japones', '#1d3b8f', '#ffffff'),
  c('KOR', 'South Korea', 'Coreia do Sul', 'AS', 'coreano', '#cd2e3a', '#ffffff'),
  c('PRK', 'North Korea', 'Coreia do Norte', 'AS', 'coreano', '#ed1c27', '#024fa2'),
  c('IRN', 'Iran', 'Irã', 'AS', 'arabe', '#ffffff', '#239f40'),
  c('KSA', 'Saudi Arabia', 'Arábia Saudita', 'AS', 'arabe', '#006c35', '#ffffff'),
  c('IRQ', 'Iraq', 'Iraque', 'AS', 'arabe', '#ce1126', '#ffffff'),
  c('KUW', 'Kuwait', 'Kuwait', 'AS', 'arabe', '#007a3d', '#ffffff'),
  c('CHN', 'China', 'China', 'AS', 'chines', '#de2910', '#ffde00'),
  c('AUS', 'Australia', 'Austrália', 'OC', 'ingles', '#ffcd00', '#00843d', { continentFrom: [[2010, 'AS']] }),
  c('NZL', 'New Zealand', 'Nova Zelândia', 'OC', 'ingles', '#ffffff', '#111111'),
];

export const COUNTRY_BY_NAME = new Map(COUNTRIES.map((x) => [x.dataName, x]));

export function eraName(meta: CountryMeta, decade: Decade): string {
  for (const [until, name] of meta.eraNames ?? []) if (decade <= until) return name;
  return meta.name;
}

export function eraContinent(meta: CountryMeta, decade: Decade): Continent {
  let cont = meta.continent;
  for (const [from, to] of meta.continentFrom ?? []) if (decade >= from) cont = to;
  return cont;
}
