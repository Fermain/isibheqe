/** The on-screen keyboard: what each key is called and which physical key types it. */
import type { Consonant, SyllabicConsonant, Vowel } from './core/glyph';

export interface KeyDef<S extends string = string> {
  symbol: S;
  /** Plain-language name, used for labels and screen readers. */
  name: string;
}

export interface KeyGroup {
  title: string;
  note?: string;
  keys: KeyDef[];
}

const v = (symbol: Vowel, name: string): KeyDef => ({ symbol, name });
const c = (symbol: string, name: string): KeyDef => ({ symbol: symbol as Consonant, name });
const s = (symbol: string, name: string): KeyDef => ({ symbol: symbol as SyllabicConsonant, name });

export const KEY_GROUPS: KeyGroup[] = [
  {
    title: 'Vowels',
    note: 'Start every syllable here. The vowel is the triangle; consonants are drawn onto it.',
    keys: [
      v('i', 'i'),
      v('a', 'a'),
      v('u', 'u'),
      v('ɛ', 'open e, as in isiZulu'),
      v('ɔ', 'open o, as in isiZulu'),
      v('e', 'close e'),
      v('o', 'close o'),
    ],
  },
  {
    title: 'Syllabic nasals',
    note: 'A nasal that is a syllable by itself, like the m in umfana.',
    keys: [s('m̩', 'syllabic m'), s('n̩', 'syllabic n'), s('ŋ̩', 'syllabic ng')],
  },
  {
    title: 'Voice and breath',
    note: 'A bare stop is aspirated (ph, th, kh). These marks change how it is voiced.',
    keys: [
      c('-', 'voiced or breathy'),
      c('•', 'ejective, implosive or plain'),
      c('°', 'prenasalised, or m'),
      c('~', 'nasal vowel'),
    ],
  },
  {
    title: 'Stops',
    note: 'Each row below runs from the lips to the back of the mouth.',
    keys: [
      c('p', 'p'),
      c('t̪', 'dental t'),
      c('t', 't'),
      c('c', 'palatal stop'),
      c('k', 'k'),
    ],
  },
  {
    title: 'Fricatives',
    keys: [
      c('ɸ', 'f made with both lips'),
      c('f', 'f'),
      c('s', 's'),
      c('ʃ', 'sh'),
      c('ȿ', 'retroflex s'),
      c('x', 'velar fricative'),
      c('h', 'h'),
      c('ɬ', 'hl'),
    ],
  },
  {
    title: 'Glides and liquids',
    keys: [
      c('w', 'w'),
      c('j', 'y'),
      c('l', 'l'),
      c('r', 'r'),
      c('ɽ', 'retroflex r'),
      c('l̩', 'syllabic l (add to l)'),
      c('r̩', 'syllabic r (add to r)'),
    ],
  },
  {
    title: 'Clicks',
    keys: [c('|', 'dental click, c'), c('!', 'alveolar click, q'), c('||', 'lateral click, x')],
  },
  {
    title: 'Nasals',
    keys: [c('n̪', 'dental n'), c('n', 'n'), c('ɲ', 'ny'), c('ŋ', 'ng')],
  },
];

export const KEY_NAMES: Record<string, string> = Object.fromEntries(
  KEY_GROUPS.flatMap((g) => g.keys.map((k) => [k.symbol, k.name])),
);

/**
 * Physical keyboard layout, kept from the 2015 tool (legacy/lib/key-mappings.js)
 * so existing muscle memory still works. Entries for glyphs the original never
 * drew (punctuation, ʧ) are left out.
 */
export const PHYSICAL_KEYS: Record<string, string> = {
  s: 'i',
  f: 'a',
  a: 'u',
  d: 'ɛ',
  g: 'ɔ',
  v: 'e',
  c: 'o',
  b: 'm̩',
  B: 'n̩',
  N: 'ŋ̩',
  j: '-',
  h: '•',
  k: '°',
  '\\': '~',
  ';': 'p',
  Y: 't̪',
  y: 't',
  n: 'c',
  t: 'k',
  z: 'ɸ',
  w: 'f',
  o: 's',
  e: 'ʃ',
  ']': 'ȿ',
  x: 'x',
  p: 'h',
  r: 'ɬ',
  u: 'w',
  '[': 'j',
  "'": 'l',
  q: 'r',
  '/': 'ɽ',
  '"': 'l̩',
  Q: 'r̩',
  m: '|',
  ',': '!',
  '.': '||',
  L: 'n̪',
  l: 'n',
  I: 'ɲ',
  i: 'ŋ',
};

export const KEY_FOR_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(PHYSICAL_KEYS).map(([key, symbol]) => [symbol, key]),
);

/** Rows of the reference chart: one consonant (or set combination) across all vowels. */
export interface ChartRow {
  label: string;
  marks: Consonant[];
}
export interface ChartSection {
  title: string;
  rows: ChartRow[];
}

const row = (label: string, ...marks: string[]): ChartRow => ({
  label,
  marks: marks as Consonant[],
});

export const CHART: ChartSection[] = [
  { title: 'Vowels', rows: [row('vowel alone')] },
  {
    title: 'Voice and breath',
    rows: [row('voiced', '-'), row('ejective', '•'), row('m', '°'), row('nasal vowel', '~')],
  },
  {
    title: 'Stops',
    rows: [row('ph', 'p'), row('t̪h', 't̪'), row('th', 't'), row('ch', 'c'), row('kh', 'k')],
  },
  {
    title: 'Fricatives',
    rows: [
      row('ɸ', 'ɸ'),
      row('f', 'f'),
      row('s', 's'),
      row('ʃ', 'ʃ'),
      row('ȿ', 'ȿ'),
      row('x', 'x'),
      row('h', 'h'),
      row('ɬ', 'ɬ'),
    ],
  },
  {
    title: 'Glides and liquids',
    rows: [
      row('w', 'w'),
      row('j', 'j'),
      row('l', 'l'),
      row('l̩l', 'l', 'l̩'),
      row('r', 'r'),
      row('r̩r', 'r', 'r̩'),
      row('ɽ', 'ɽ'),
    ],
  },
  { title: 'Clicks', rows: [row('ǀ', '|'), row('ǃ', '!'), row('ǁ', '||')] },
  { title: 'Nasals', rows: [row('n̪', 'n̪'), row('n', 'n'), row('ɲ', 'ɲ'), row('ŋ', 'ŋ')] },
  {
    title: 'Set combinations',
    rows: [
      row('ʒ', 'ʃ', '-'),
      row('tʃ', 'ʃ', 't'),
      row('dʒ', 'ʃ', 't', '-'),
      row('ʐ', 'ȿ', '-'),
      row('tȿ', 'ȿ', 't'),
      row('dʐ', 'ȿ', 't', '-'),
      row('tw', 't', 'w'),
      row('sw', 's', 'w'),
    ],
  },
];
