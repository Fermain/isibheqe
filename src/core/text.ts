/**
 * The document model: a flat list of tokens, laid out left to right.
 *
 * The JSON form is the one the 2015 tool used, so text saved from the
 * original keyboard still loads here:
 *   ["u", ["a", ["p", "-"]], " ", "m̩", "\n"]
 */
import { BASE, pt, type Frame, type Point, type Stroke } from './geometry';
import {
  buildSyllabicConsonant,
  buildSyllable,
  isConsonant,
  isSyllabicConsonant,
  isVowel,
  type Consonant,
  type SyllabicConsonant,
  type Vowel,
} from './glyph';

export type Token =
  | { kind: 'syllable'; vowel: Vowel; consonants: Consonant[]; source?: string }
  | { kind: 'syllabic'; letter: SyllabicConsonant; source?: string }
  | { kind: 'space' }
  | { kind: 'newline' };

export function serialize(tokens: readonly Token[]): string {
  return JSON.stringify(
    tokens.map((t) => {
      switch (t.kind) {
        case 'space':
          return ' ';
        case 'newline':
          return '\n';
        case 'syllabic':
          return t.letter;
        case 'syllable':
          return t.consonants.length > 0 ? [t.vowel, t.consonants] : t.vowel;
      }
    }),
  );
}

/** Parse the JSON form. Throws an Error with a readable message on bad input. */
export function deserialize(json: string): Token[] {
  const data: unknown = JSON.parse(json);
  if (!Array.isArray(data)) throw new Error('Expected a JSON list.');
  return data.map((item, i): Token => {
    const where = `item ${i + 1}`;
    if (item === ' ') return { kind: 'space' };
    if (item === '\n') return { kind: 'newline' };
    const [head, rest] = Array.isArray(item) ? item : [item, []];
    if (typeof head !== 'string') throw new Error(`Unreadable ${where}.`);
    const letter = head.normalize('NFD');
    if (isSyllabicConsonant(letter)) return { kind: 'syllabic', letter };
    if (!isVowel(letter)) throw new Error(`Unknown vowel "${head}" at ${where}.`);
    if (!Array.isArray(rest)) throw new Error(`Unreadable consonants at ${where}.`);
    const consonants = rest.map((c) => {
      const mark = typeof c === 'string' ? c.normalize('NFD') : '';
      if (!isConsonant(mark)) throw new Error(`Unknown consonant "${c}" at ${where}.`);
      return mark;
    });
    return { kind: 'syllable', vowel: letter, consonants };
  });
}

export interface Placed {
  /** Index of the token this glyph came from. */
  index: number;
  strokes: Stroke[];
  /** Top-left corner of the glyph's cell. */
  at: Point;
  advance: number;
  frame: Frame;
}

export interface Layout {
  glyphs: Placed[];
  width: number;
  height: number;
}

/** Tighter than the 2015 tool's (3 × HEIGHT), which left most of each line empty. */
export const lineHeight = (unit: number) => unit * 31;
export const spaceWidth = (unit: number) => unit * BASE * 1.1;
export const strokeWidth = (unit: number) => unit / 3;
/** Height of a single line of glyphs, including marks above and below. */
export const rowHeight = (unit: number) => unit * 27;
/** Extra room under each line when readings are shown beneath the glyphs. */
export const glossHeight = (unit: number) => unit * 6;

/**
 * Place tokens on lines. Words (runs between spaces) wrap whole when they
 * would cross `maxWidth`.
 */
export function layout(
  tokens: readonly Token[],
  unit: number,
  maxWidth = Infinity,
  gloss = false,
): Layout {
  const extra = gloss ? glossHeight(unit) : 0;
  const step = lineHeight(unit) + extra;
  const advances = tokens.map((t) => {
    if (t.kind === 'syllable') return buildSyllable(t.vowel, t.consonants, unit).advance;
    if (t.kind === 'syllabic') return buildSyllabicConsonant(t.letter, unit).advance;
    return 0;
  });

  const glyphs: Placed[] = [];
  let x = 0;
  let y = 0;
  let width = 0;

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.kind === 'space') {
      x += spaceWidth(unit);
      i++;
      continue;
    }
    if (token.kind === 'newline') {
      x = 0;
      y += step;
      i++;
      continue;
    }
    // Measure the word starting here.
    let end = i;
    let wordWidth = 0;
    while (end < tokens.length) {
      const kind = tokens[end].kind;
      if (kind === 'space' || kind === 'newline') break;
      wordWidth += advances[end];
      end++;
    }
    if (x > 0 && x + wordWidth > maxWidth) {
      x = 0;
      y += step;
    }
    for (; i < end; i++) {
      const t = tokens[i];
      const at = pt(x, y);
      const built =
        t.kind === 'syllable'
          ? buildSyllable(t.vowel, t.consonants, unit, at)
          : t.kind === 'syllabic'
            ? buildSyllabicConsonant(t.letter, unit, at)
            : null;
      if (!built) continue;
      glyphs.push({ index: i, strokes: built.strokes, at, advance: built.advance, frame: built.frame });
      x += built.advance;
      width = Math.max(width, x);
    }
  }

  return { glyphs, width, height: y + rowHeight(unit) + extra };
}
