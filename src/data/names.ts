import type { Rng } from '../engine/prng';
import type { Culture } from './countries';

/**
 * Nomes 100% inventados: o prenome vem de uma lista genérica da cultura e o sobrenome é montado
 * por sílabas (prefixo + meio opcional + sufixo), para não coincidir de propósito com jogadores reais.
 */
interface NamePool {
  first: string[];
  pre: string[];
  mid: string[];
  suf: string[];
}

const POOLS: Record<Culture, NamePool> = {
  portugues: {
    first: ['Adalberto', 'Wilson', 'Edmar', 'Jurandir', 'Reinaldo', 'Cláudio', 'Osmar', 'Nélson', 'Ademir', 'Valdir', 'Celso', 'Hélio', 'Rogério', 'Tadeu', 'Gilmar', 'Anderson', 'Fábio', 'Marcelo', 'Rui', 'Tiago'],
    pre: ['Bar', 'Cal', 'Fer', 'Gui', 'Lou', 'Mon', 'Pin', 'Sam', 'Tor', 'Vil', 'Nas', 'Cor', 'Ara', 'Bra'],
    mid: ['', '', 'ta', 're', 'di', 'lo'],
    suf: ['deiro', 'zinho', 'ões', 'eira', 'ante', 'osa', 'ento', 'ares', 'lho', 'ndes'],
  },
  espanhol: {
    first: ['Anselmo', 'Rufino', 'Heriberto', 'Aurelio', 'Baltasar', 'Nicanor', 'Ismael', 'Rodolfo', 'Esteban', 'Mauricio', 'Fabián', 'Leandro', 'Ezequiel', 'Gaspar', 'Octavio', 'Ramiro', 'Sergio', 'Tomás', 'Joaquín', 'Hugo'],
    pre: ['Zam', 'Quin', 'Mal', 'Arr', 'Cas', 'Dor', 'Fon', 'Gar', 'Lor', 'Mor', 'Oli', 'Pal', 'Rey', 'Sal'],
    mid: ['', '', 'ra', 'co', 'ti', 'ne'],
    suf: ['bide', 'ández', 'ero', 'illa', 'ales', 'ondo', 'eda', 'unes', 'ez', 'ardo'],
  },
  italiano: {
    first: ['Ottavio', 'Bruno', 'Aldo', 'Silvano', 'Corrado', 'Ennio', 'Franco', 'Livio', 'Mauro', 'Nevio', 'Renzo', 'Sandro', 'Tullio', 'Ubaldo', 'Valerio', 'Gino', 'Dario', 'Elio', 'Fulvio', 'Ivo'],
    pre: ['Bel', 'Cor', 'Dal', 'Fan', 'Gal', 'Lom', 'Mar', 'Nov', 'Pan', 'Ros', 'Sca', 'Tor', 'Var', 'Zan'],
    mid: ['', '', 'ta', 'ri', 'ne', 'do'],
    suf: ['etti', 'ini', 'ardi', 'ano', 'ozzi', 'elli', 'ucci', 'atto', 'one', 'oldi'],
  },
  germanico: {
    first: ['Anselm', 'Bernd', 'Dieter', 'Egon', 'Frieder', 'Gerold', 'Hartmut', 'Ingo', 'Jürgen', 'Konrad', 'Lothar', 'Manfred', 'Norbert', 'Rainer', 'Siegfried', 'Torsten', 'Uwe', 'Volker', 'Wolfram', 'Lukas'],
    pre: ['Brand', 'Dorn', 'Eich', 'Falk', 'Graf', 'Hel', 'Kess', 'Lind', 'Neu', 'Rau', 'Stein', 'Voss', 'Wald', 'Zim'],
    mid: ['', '', 'en', 'er', 'el'],
    suf: ['mann', 'berg', 'ner', 'feld', 'hauer', 'meier', 'stadt', 'bach', 'ler', 'wald'],
  },
  frances: {
    first: ['Armand', 'Baptiste', 'Clément', 'Désiré', 'Émile', 'Fabrice', 'Gaston', 'Hector', 'Ismaël', 'Jérôme', 'Lucien', 'Maxime', 'Nicolas', 'Olivier', 'Pascal', 'Quentin', 'Rémy', 'Sylvain', 'Thierry', 'Xavier'],
    pre: ['Beau', 'Cha', 'Dela', 'Fon', 'Gau', 'Lam', 'Mar', 'Pel', 'Rou', 'Sau', 'Tho', 'Val', 'Bri', 'Cour'],
    mid: ['', '', 'ne', 'ti', 'ro'],
    suf: ['tier', 'ault', 'ineau', 'omont', 'ard', 'oux', 'ette', 'ier', 'eron', 'ac'],
  },
  ingles: {
    first: ['Alfie', 'Barry', 'Clive', 'Dennis', 'Errol', 'Gareth', 'Howard', 'Ian', 'Jasper', 'Keith', 'Leonard', 'Malcolm', 'Neville', 'Owen', 'Percy', 'Roy', 'Stuart', 'Trevor', 'Wayne', 'Colin'],
    pre: ['Ash', 'Brad', 'Cart', 'Dray', 'Fen', 'Gold', 'Har', 'Kel', 'Lang', 'Mar', 'Pen', 'Rad', 'Shaw', 'Whit'],
    mid: ['', '', 'ing', 'er', 'le'],
    suf: ['ford', 'ley', 'worth', 'ton', 'well', 'field', 'by', 'wick', 'combe', 'dale'],
  },
  neerlandes: {
    first: ['Aart', 'Bram', 'Cees', 'Dirk', 'Evert', 'Frits', 'Gerrit', 'Hendrik', 'Jaap', 'Klaas', 'Lars', 'Maarten', 'Niek', 'Piet', 'Rutger', 'Sander', 'Teun', 'Wim', 'Joost', 'Ruud'],
    pre: ['Van', 'De', 'Kuip', 'Bos', 'Dijk', 'Haan', 'Mol', 'Veld', 'Wou', 'Zwa', 'Brink', 'Gro'],
    mid: ['', '', 'der', 'en'],
    suf: ['kamp', 'hoven', 'steyn', 'brink', 'ma', 'sma', 'huis', 'beek', 'laan', 'dorp'],
  },
  eslavo: {
    first: ['Bohdan', 'Dragan', 'Emil', 'Gennadi', 'Igor', 'Jaroslav', 'Kazimir', 'Lev', 'Milan', 'Nikola', 'Oleg', 'Pavel', 'Radek', 'Stanislav', 'Tomas', 'Viktor', 'Vlad', 'Zdenek', 'Anton', 'Boris'],
    pre: ['Bel', 'Dra', 'Gor', 'Hor', 'Kal', 'Lesh', 'Mal', 'Nov', 'Ostr', 'Pet', 'Rad', 'Sok', 'Vol', 'Zhel'],
    mid: ['', '', 'ko', 'ni', 'va'],
    suf: ['enko', 'ovski', 'ichev', 'anek', 'inski', 'ovic', 'ulin', 'arev', 'oski', 'ejev'],
  },
  magiar: {
    first: ['Ákos', 'Bálint', 'Csaba', 'Dezső', 'Endre', 'Ferenc', 'Gábor', 'Imre', 'János', 'Károly', 'László', 'Miklós', 'Nándor', 'Olivér', 'Péter', 'Rezső', 'Sándor', 'Tibor', 'Zoltán', 'Attila'],
    pre: ['Bak', 'Cser', 'Dar', 'Eper', 'Fazek', 'Gyur', 'Hor', 'Kar', 'Lak', 'Nad', 'Pász', 'Szal', 'Tor', 'Vas'],
    mid: ['', '', 'a', 'o'],
    suf: ['os', 'ai', 'ay', 'ics', 'esi', 'ányi', 'ócz', 'ódy', 'ári', 'ősi'],
  },
  balcanico: {
    first: ['Aleksandar', 'Branko', 'Darko', 'Goran', 'Ilija', 'Jovan', 'Luka', 'Mirko', 'Novak', 'Predrag', 'Slobodan', 'Stipe', 'Tihomir', 'Vedran', 'Zoran', 'Dimitri', 'Kostas', 'Mehmet', 'Emre', 'Costin'],
    pre: ['Bar', 'Cve', 'Dok', 'Glo', 'Jan', 'Kos', 'Lju', 'Mat', 'Pop', 'Rak', 'Srd', 'Tom', 'Vuk', 'Yil'],
    mid: ['', '', 'ko', 'ti', 'ma'],
    suf: ['ović', 'ić', 'ašević', 'ulescu', 'opoulos', 'oglu', 'ac', 'ović', 'iou', 'ean'],
  },
  nordico: {
    first: ['Anders', 'Bjørn', 'Claes', 'Dag', 'Erik', 'Folke', 'Gunnar', 'Håkan', 'Ivar', 'Jens', 'Kjell', 'Leif', 'Magnus', 'Nils', 'Ole', 'Per', 'Rolf', 'Sten', 'Thor', 'Ulf'],
    pre: ['Berg', 'Dahl', 'Eng', 'Fors', 'Gran', 'Hol', 'Lund', 'Nord', 'Ros', 'Sand', 'Skog', 'Strand', 'Vik', 'Ek'],
    mid: ['', '', 'e', 'a'],
    suf: ['gren', 'strøm', 'mark', 'holm', 'sen', 'lund', 'dal', 'vall', 'quist', 'berg'],
  },
  arabe: {
    first: ['Adel', 'Bashir', 'Chafik', 'Dawud', 'Fadil', 'Ghazi', 'Hamid', 'Idris', 'Jalal', 'Karim', 'Lotfi', 'Mounir', 'Nabil', 'Omar', 'Rachid', 'Sami', 'Tarek', 'Walid', 'Yassin', 'Zaki'],
    pre: ['Al', 'Bel', 'Ben', 'El', 'Haj', 'Kha', 'Man', 'Naz', 'Qas', 'Rah', 'Sal', 'Tah', 'Zay', 'Far'],
    mid: ['', 'ra', 'li', 'ma', 'di'],
    suf: ['sour', 'hadi', 'mani', 'rouf', 'kari', 'dali', 'bari', 'zouri', 'fahi', 'nasri'],
  },
  africano: {
    first: ['Abdoulaye', 'Bakary', 'Chidi', 'Demba', 'Emeka', 'Femi', 'Gyasi', 'Ibrahima', 'Jojo', 'Kofi', 'Lamine', 'Moussa', 'Nana', 'Obinna', 'Papa', 'Quincy', 'Sekou', 'Tunde', 'Yaw', 'Zola'],
    pre: ['Ade', 'Bam', 'Dia', 'Eko', 'Fo', 'Gba', 'Kon', 'Mba', 'Nko', 'Oko', 'Sow', 'Tou', 'Ume', 'Wam'],
    mid: ['', 'ne', 'ra', 'ko', 'la'],
    suf: ['gbe', 'kou', 'mba', 'nyo', 'wale', 'ndi', 'dou', 'fuor', 'lema', 'bayo'],
  },
  japones: {
    first: ['Akira', 'Daiki', 'Eiji', 'Hiroshi', 'Isamu', 'Jun', 'Kenji', 'Masao', 'Noboru', 'Osamu', 'Ryota', 'Satoru', 'Takeshi', 'Yuji', 'Haruki', 'Kazuo', 'Shigeru', 'Tadashi', 'Yoshio', 'Naoki'],
    pre: ['Aka', 'Fuji', 'Hata', 'Ino', 'Kano', 'Mori', 'Nishi', 'Oga', 'Saka', 'Take', 'Uchi', 'Yama', 'Waka', 'Tomi'],
    mid: ['', 'mi', 'ta', 'ne'],
    suf: ['moto', 'zawa', 'shita', 'yama', 'gawa', 'hara', 'kura', 'mura', 'sato', 'be'],
  },
  coreano: {
    first: ['Dae-ho', 'Gwang-su', 'Hyun-woo', 'Jae-min', 'Ki-tae', 'Min-jun', 'Sang-hoon', 'Seung-ho', 'Tae-yang', 'Woo-jin', 'Yong-soo', 'Chul-min', 'Do-hyun', 'Joon-ho', 'Sung-min', 'Byung-ho', 'Hee-chan', 'Il-sung', 'Kwang-ho', 'Nam-gil'],
    pre: ['Bae', 'Choi', 'Gu', 'Han', 'Hwang', 'Jeon', 'Kang', 'Moon', 'Noh', 'Oh', 'Seo', 'Shin', 'Yoon', 'Baek'],
    mid: ['', '', 'ra', 'mi'],
    suf: ['', '', 'dong', 'gil', 'mun', 'hyeon', 'seok', 'rim'],
  },
  chines: {
    first: ['Bao', 'Chen', 'Dawei', 'Feng', 'Guang', 'Hao', 'Jian', 'Kai', 'Lei', 'Ming', 'Peng', 'Qiang', 'Rui', 'Shan', 'Tao', 'Wei', 'Xin', 'Yong', 'Zhi', 'Long'],
    pre: ['Cai', 'Deng', 'Fang', 'Gao', 'Hu', 'Jiang', 'Lu', 'Mao', 'Pan', 'Qin', 'Shen', 'Tang', 'Xu', 'Zhou'],
    mid: ['', '', 'ra', 'li'],
    suf: ['', '', 'ang', 'ong', 'ui', 'an', 'eng'],
  },
};

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function generateName(culture: Culture, rng: Rng): { first: string; last: string } {
  const pool = POOLS[culture];
  const last = cap(rng.pick(pool.pre) + rng.pick(pool.mid) + rng.pick(pool.suf));
  return { first: rng.pick(pool.first), last };
}

/** Gera `count` nomes distintos dentro do mesmo elenco. */
export function generateUniqueNames(culture: Culture, rng: Rng, count: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 50) {
    const { first, last } = generateName(culture, rng);
    const full = `${first} ${last}`;
    if (seen.has(full)) continue;
    seen.add(full);
    out.push(full);
  }
  return out;
}
