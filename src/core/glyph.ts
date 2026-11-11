/**
 * Glyph construction: one syllable in, a list of strokes out.
 *
 * This is a faithful port of legacy/lib/isibheqe-glyphs.js (Baruch Lubinsky,
 * 2015). Every proportion below is the original's. tests/parity.test.ts runs
 * the legacy code side by side with this file to prove the forms are unchanged.
 */
import {
  BASE,
  HEIGHT,
  TONE,
  add,
  mid,
  pt,
  scale,
  sub,
  type Frame as Triangle,
  type Point,
  type Stroke,
} from './geometry';

export const VOWELS = ['i', 'a', 'u', 'e', 'o', 'ɔ', 'ɛ'] as const;
export type Vowel = (typeof VOWELS)[number];

const DENTAL = '̪'; // combining bridge below
const SYLLABIC = '̩'; // combining vertical line below

export const CONSONANTS = [
  '-',
  '•',
  '°',
  '~',
  't',
  'p',
  `t${DENTAL}`,
  'c',
  'k',
  'ɸ',
  'f',
  's',
  'ʃ',
  'ȿ',
  'x',
  'h',
  'ɬ',
  'w',
  'j',
  'l',
  'r',
  'ɽ',
  '|',
  '!',
  '||',
  `n${DENTAL}`,
  'n',
  'ɲ',
  'ŋ',
  `l${SYLLABIC}`,
  `r${SYLLABIC}`,
] as const;
export type Consonant = (typeof CONSONANTS)[number];

export const SYLLABIC_CONSONANTS = [`m${SYLLABIC}`, `n${SYLLABIC}`, `ŋ${SYLLABIC}`] as const;
export type SyllabicConsonant = (typeof SYLLABIC_CONSONANTS)[number];

const T_DENTAL = `t${DENTAL}` as Consonant;
const N_DENTAL = `n${DENTAL}` as Consonant;
const L_SYLLABIC = `l${SYLLABIC}` as Consonant;
const R_SYLLABIC = `r${SYLLABIC}` as Consonant;

export const isVowel = (s: string): s is Vowel => (VOWELS as readonly string[]).includes(s);
export const isConsonant = (s: string): s is Consonant =>
  (CONSONANTS as readonly string[]).includes(s);
export const isSyllabicConsonant = (s: string): s is SyllabicConsonant =>
  (SYLLABIC_CONSONANTS as readonly string[]).includes(s);

type Direction = 'up' | 'down' | 'left' | 'right';

/** Which way the apex points, and whether the base is drawn. */
export const VOWEL_SHAPES: Record<Vowel, { dir: Direction; solid: boolean }> = {
  i: { dir: 'up', solid: true },
  a: { dir: 'down', solid: true },
  u: { dir: 'up', solid: false },
  e: { dir: 'left', solid: false },
  o: { dir: 'right', solid: false },
  ɔ: { dir: 'right', solid: true },
  ɛ: { dir: 'left', solid: true },
};

export interface Built {
  strokes: Stroke[];
  /** Horizontal distance to the next glyph. */
  advance: number;
  /** The triangle the glyph is built on. */
  frame: Triangle;
}

interface Frame {
  origin: Point;
  apex: Point;
  base: Point;
  /** Canvas angle pointing from the base towards the apex, minus a half turn. */
  zero: number;
  /** Maps a vector written for the upward triangle into this orientation. */
  turn: (p: Point) => Point;
}

function frame(dir: Direction, unit: number, margin: number, baseline: number): Frame {
  switch (dir) {
    case 'up':
      return {
        origin: pt(margin, baseline),
        apex: pt(margin + (BASE / 2) * unit, baseline - HEIGHT * unit),
        base: pt(margin + BASE * unit, baseline),
        zero: 1.5 * Math.PI,
        turn: (p) => pt(p.x, p.y),
      };
    case 'down':
      return {
        origin: pt(margin + BASE * unit, baseline - HEIGHT * unit),
        apex: pt(margin + (BASE / 2) * unit, baseline),
        base: pt(margin, baseline - HEIGHT * unit),
        zero: 0.5 * Math.PI,
        turn: (p) => pt(p.x, -p.y),
      };
    case 'left':
      return {
        origin: pt(margin + HEIGHT * unit, baseline),
        apex: pt(margin, baseline - (BASE / 2) * unit),
        base: pt(margin + HEIGHT * unit, baseline - BASE * unit),
        zero: Math.PI,
        turn: (p) => pt(-p.y, -p.x),
      };
    case 'right':
      return {
        origin: pt(margin, baseline - BASE * unit),
        apex: pt(margin + HEIGHT * unit, baseline - (BASE / 2) * unit),
        base: pt(margin, baseline),
        zero: 0,
        turn: (p) => pt(p.y, p.x),
      };
  }
}

const baselineFor = (origin: Point, unit: number) => origin.y + (TONE + HEIGHT + 2) * unit;

/** Build one syllable block: a vowel shape carrying any number of consonant marks. */
export function buildSyllable(
  vowel: Vowel,
  consonants: readonly Consonant[],
  unit: number,
  at: Point = pt(0, 0),
): Built {
  const list = [...new Set(consonants)];
  const has = (...cs: Consonant[]) => cs.some((c) => list.includes(c));
  const { dir, solid } = VOWEL_SHAPES[vowel];

  // Room needed beyond the triangle for marks that sit outside it.
  const nasalCircle = has(N_DENTAL, 'n', 'ɲ', 'ŋ', '°');
  const top = has('f') ? 5 * unit : nasalCircle || has('~') ? 2 * TONE * unit : 0;
  const bottom = has('j') ? 6 * unit : nasalCircle && has('~') ? 2 * TONE * unit : 0;
  const left = has('l') ? (has(L_SYLLABIC) ? 4 : 2) * unit : 0;
  const padding = { up: left, down: 0, left: top, right: bottom }[dir];
  const vertical = dir === 'left' || dir === 'right';
  const advance = vertical ? top + BASE * unit + bottom : BASE * unit + padding;

  const { origin, apex, base, zero, turn } = frame(
    dir,
    unit,
    at.x + padding,
    baselineFor(at, unit),
  );
  const move = (a: Point, b: Point) => add(a, turn(b));
  const vector = (a: Point, b: Point) => turn(sub(a, b));
  const midBase = mid(origin, base);

  const strokes: Stroke[] = [];
  let by: string = vowel;
  const line = (a: Point, b: Point) => strokes.push({ kind: 'line', a, b, by });
  const arc = (c: Point, r: number, start: number, end: number) =>
    strokes.push({ kind: 'arc', c, r, start, end, by });
  const circle = (c: Point, r: number) => strokes.push({ kind: 'circle', c, r, by });
  const dot = (c: Point, r: number) => strokes.push({ kind: 'dot', c, r, by });

  line(origin, apex);
  line(apex, base);
  if (solid) line(origin, base);

  // Centre and radius of the nasal circle that sits on the apex.
  const NASAL_H = 0.18;
  const nasalCentre = () => move(midBase, scale(vector(apex, midBase), 1 + NASAL_H));
  const nasalRadius = NASAL_H * HEIGHT * unit;

  for (const c of list) {
    by = c;
    switch (c) {
      case '-':
        if (!has('ʃ', 'ȿ')) line(midBase, apex);
        break;
      case '•': {
        let centre = move(midBase, scale(vector(apex, midBase), 0.12));
        let radius = unit;
        if (has(R_SYLLABIC)) {
          centre = move(centre, scale(vector(base, origin), 0.32));
        } else if (has('-')) {
          const h = has('k', '|', '!') ? 0.32 : 0.18;
          centre = move(centre, scale(vector(base, origin), h));
        } else if (has('k', '|', '!')) {
          radius *= 0.7;
        }
        dot(centre, radius);
        break;
      }
      case '°':
        circle(nasalCentre(), nasalRadius);
        break;
      case '~': {
        // The specification moves the nasal-vowel dot to the base side when a
        // nasal circle already occupies the apex. (The 2015 code tested for the
        // wrong symbols here, so ɲ and ŋ were missed; this follows the spec.)
        const centre = nasalCircle
          ? move(apex, scale(vector(midBase, apex), 1 + NASAL_H))
          : nasalCentre();
        dot(centre, NASAL_H * 0.6 * HEIGHT * unit);
        break;
      }
      case 't':
        if (!has('ʃ', 'ȿ')) {
          line(
            move(origin, scale(vector(apex, origin), 1 / 3)),
            move(base, scale(vector(apex, base), 1 / 3)),
          );
        }
        break;
      case 'p':
        line(move(apex, pt(-0.5 * BASE * unit, 0)), move(apex, pt(0.5 * BASE * unit, 0)));
        break;
      case T_DENTAL:
        for (const h of [0.9 / 3, 1.2 / 3]) {
          line(
            move(origin, scale(vector(apex, origin), h)),
            move(base, scale(vector(apex, base), h)),
          );
        }
        break;
      case 'c':
        line(mid(origin, apex), base);
        line(mid(base, apex), origin);
        break;
      case 'k': {
        const o = move(origin, scale(vector(base, origin), 0.35));
        const a = move(midBase, scale(vector(apex, midBase), 0.3));
        const b = move(origin, scale(vector(base, origin), 0.65));
        line(o, a);
        line(a, b);
        break;
      }
      case 'ɸ':
        arc(mid(midBase, apex), (HEIGHT / 2) * unit, zero + Math.PI / 4, zero - Math.PI / 4);
        break;
      case 'f':
        arc(
          move(midBase, scale(vector(apex, midBase), 1.5)),
          (HEIGHT / 2) * unit,
          zero + Math.PI + Math.PI / 4,
          zero + Math.PI - Math.PI / 4,
        );
        break;
      case 's':
        arc(
          apex,
          (BASE / 2) * unit,
          zero + Math.PI + Math.PI / 6,
          zero + Math.PI - Math.PI / 6,
        );
        break;
      case 'ʃ': {
        const h = 0.4;
        const centre = move(midBase, scale(vector(apex, midBase), h));
        circle(centre, (TONE / 2) * unit);
        const tip = move(centre, scale(vector(midBase, centre), (TONE * 1.24) / HEIGHT));
        if (!has('t')) {
          line(origin, tip);
          line(tip, base);
        } else {
          const reach = 1.07 * h * (HEIGHT / (BASE / 2));
          line(
            move(tip, scale(vector(origin, midBase), reach)),
            move(tip, scale(vector(base, midBase), reach)),
          );
        }
        if (has('-')) line(midBase, tip);
        break;
      }
      case 'ȿ': {
        const h = 0.25;
        const centre = move(midBase, scale(vector(apex, midBase), h));
        circle(centre, (TONE / 2) * unit);
        const tip = move(centre, scale(vector(apex, centre), TONE / 1.3 / HEIGHT));
        if (!has('t')) {
          line(move(origin, scale(vector(apex, origin), 0.6)), tip);
          line(tip, move(base, scale(vector(apex, base), 0.6)));
        } else {
          line(
            move(tip, scale(vector(origin, midBase), h * 2.3)),
            move(tip, scale(vector(base, midBase), h * 2.3)),
          );
        }
        if (has('-')) line(apex, tip);
        break;
      }
      case 'x':
        arc(midBase, BASE * 0.27 * unit, zero + Math.PI / 2, zero - Math.PI / 2);
        break;
      case 'h':
        circle(move(midBase, scale(vector(apex, midBase), 0.25)), (TONE / 2.2) * unit);
        break;
      case 'ɬ': {
        const end = zero - Math.PI / 6;
        arc(mid(base, apex), (BASE / 4) * unit, end + Math.PI, end);
        break;
      }
      case 'w': {
        let h = 0.6;
        if (has(T_DENTAL, 't', 'ɽ')) h = 0.32;
        else if (has('s', 'c', 'x', 'r', '||', 'ʃ', 'ȿ')) h = 0.5;
        const a = h * Math.cos(Math.PI / 3);
        line(
          move(origin, scale(vector(apex, origin), h)),
          move(origin, scale(vector(base, origin), a)),
        );
        line(
          move(base, scale(vector(apex, base), h)),
          move(base, scale(vector(origin, base), a)),
        );
        break;
      }
      case 'j': {
        const p = move(midBase, scale(vector(midBase, apex), 0.6));
        line(mid(p, origin), midBase);
        line(mid(p, base), midBase);
        break;
      }
      case 'l':
        for (const h of has(L_SYLLABIC) ? [0.1, 0.2] : [0.1]) {
          line(
            move(origin, scale(vector(origin, base), h)),
            move(apex, scale(vector(origin, base), h)),
          );
        }
        break;
      case 'r': {
        const tip = move(midBase, scale(vector(apex, midBase), 0.3));
        line(move(origin, scale(vector(apex, origin), 2 / 3)), tip);
        line(tip, move(base, scale(vector(apex, base), 2 / 3)));
        if (has(R_SYLLABIC)) {
          line(midBase, mid(origin, apex));
          line(midBase, mid(base, apex));
        }
        break;
      }
      case 'ɽ': {
        const h = 0.65;
        const start = move(apex, scale(vector(origin, apex), h));
        const end = move(apex, scale(vector(base, apex), h));
        line(start, end);
        line(mid(start, end), apex);
        break;
      }
      case '|':
      case '!': {
        const h = 0.6;
        const a = h * Math.cos(Math.PI / 3);
        const oa = move(origin, scale(vector(apex, origin), h));
        const ob = move(origin, scale(vector(base, origin), a));
        const ba = move(base, scale(vector(apex, base), h));
        const bo = move(base, scale(vector(origin, base), a));
        line(oa, ba);
        line(oa, bo);
        line(ba, ob);
        if (c === '|') line(mid(oa, origin), mid(ba, base));
        break;
      }
      case '||': {
        const start = mid(origin, apex);
        const end = move(start, scale(vector(mid(apex, base), start), 1.5));
        line(start, end);
        line(end, mid(midBase, base));
        break;
      }
      case N_DENTAL: {
        const centre = nasalCentre();
        circle(centre, nasalRadius);
        const dx = Math.cos(Math.PI / 9) * nasalRadius;
        const dy = Math.sin(Math.PI / 9) * nasalRadius;
        line(move(centre, pt(dx, dy)), move(centre, pt(-dx, dy)));
        line(move(centre, pt(dx, -dy)), move(centre, pt(-dx, -dy)));
        break;
      }
      case 'n': {
        const centre = nasalCentre();
        circle(centre, nasalRadius);
        line(move(centre, pt(nasalRadius, 0)), move(centre, pt(-nasalRadius, 0)));
        break;
      }
      case 'ɲ': {
        const centre = nasalCentre();
        circle(centre, nasalRadius);
        const d = Math.cos(Math.PI / 4) * nasalRadius;
        line(move(centre, pt(-d, d)), centre);
        line(centre, move(centre, pt(d, d)));
        break;
      }
      case 'ŋ': {
        const centre = nasalCentre();
        circle(centre, nasalRadius);
        const dx = Math.cos(Math.PI / 4) * nasalRadius;
        const dy = Math.sin(Math.PI / 4) * nasalRadius;
        line(move(centre, pt(dx, dy)), move(centre, pt(-dx, -dy)));
        line(move(centre, pt(-dx, dy)), move(centre, pt(dx, -dy)));
        break;
      }
      // l̩ and r̩ have no stroke of their own: they change how l and r are drawn.
    }
  }

  return { strokes, advance, frame: { origin, apex, base, open: !solid } };
}

/** Build a syllabic nasal: a circle filling the whole block, with no vowel. */
export function buildSyllabicConsonant(
  letter: SyllabicConsonant,
  unit: number,
  at: Point = pt(0, 0),
): Built {
  const { origin, apex, base } = frame('up', unit, at.x, baselineFor(at, unit));
  const radius = (HEIGHT / 2) * unit;
  const centre = mid(mid(origin, base), apex);
  const by = letter;
  const strokes: Stroke[] = [{ kind: 'circle', c: centre, r: radius, by }];
  if (letter === SYLLABIC_CONSONANTS[1]) {
    strokes.push({
      kind: 'line',
      a: pt(centre.x - radius, centre.y),
      b: pt(centre.x + radius, centre.y),
      by,
    });
  } else if (letter === SYLLABIC_CONSONANTS[2]) {
    const d = Math.sin(Math.PI / 4) * radius;
    strokes.push(
      { kind: 'line', a: pt(centre.x - d, centre.y - d), b: pt(centre.x + d, centre.y + d), by },
      { kind: 'line', a: pt(centre.x - d, centre.y + d), b: pt(centre.x + d, centre.y - d), by },
    );
  }
  return { strokes, advance: (BASE + 2) * unit, frame: { origin, apex, base, open: false } };
}
