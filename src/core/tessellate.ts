/**
 * An experimental second way to lay text out: tessellated, after the
 * coloured rendering of "Ditema tsa Dinoko" on the script's Wikipedia page.
 *
 * Most glyphs stand exactly where and how the ordinary line puts them. Here
 * and there, neighbouring syllables of a word interlock into one shape, the
 * way letters join in a ligature. Two shapes are made:
 *
 *   - The square. Every glyph is a quarter of a square cut by its diagonals,
 *     and the vowel decides which quarter: i and u (apex up) the bottom, a
 *     (apex down) the top, e and ɛ (apex left) the right, o and ɔ (apex
 *     right) the left, so that the apexes meet in the middle. Only glyphs
 *     whose marks all lie inside their triangle can join, since anything
 *     outside would land in a neighbour's quarter.
 *   - The diamond. An i syllable sits on top of the a syllable that follows
 *     it, base to base, as "di" sits on "ma" in the image. Marks on or
 *     beyond the apex point away from the join, so nasals and the p bar are
 *     welcome; only marks beyond the base are not. u cannot take i's place:
 *     its open base would be closed by the a below and it would read as i.
 *
 * Three things here are this experiment's own and come from no source:
 *   - Flattening. Both shapes need triangles half as high as they are wide
 *     (the designed triangle is 13.8 : 16), so a glyph that joins a shape is
 *     squashed along its axis. Lines keep their meeting points; circles stay
 *     round and shrink by the same factor. core/glyph.ts is not touched, and
 *     a glyph that stands alone is not flattened.
 *   - Reading order inside a shape: left, top, bottom, right. A syllable
 *     joins a square only if its quarter comes later in that order than the
 *     last one filled. A diamond is its top, then its bottom.
 *   - Size. Nothing in the 2015 sheet gives the size of a glyph a meaning,
 *     which is what lets flat and full-size glyphs stand in one word.
 *
 * Shapes never cross a word boundary.
 */
import {
  BASE,
  HEIGHT,
  TONE,
  add,
  pt,
  scale,
  sub,
  type Frame,
  type Point,
  type Stroke,
} from './geometry';
import { VOWEL_SHAPES, buildSyllabicConsonant, buildSyllable, type Built } from './glyph';
import { glossHeight, lineHeight, rowHeight, spaceWidth, type Layout, type Placed, type Token } from './text';

export type Slot = 'left' | 'top' | 'bottom' | 'right';
const SLOT_ORDER: readonly Slot[] = ['left', 'top', 'bottom', 'right'];
/** The quarter a vowel's triangle fills: opposite to the way its apex points. */
const SLOT_FOR = { right: 'left', down: 'top', up: 'bottom', left: 'right' } as const;

export const squareSide = (unit: number) => BASE * unit;

type Triangle = Pick<Frame, 'origin' | 'apex' | 'base'>;

/** Marks drawn as a circle on the apex with bars inside it. */
const NASAL_MARKS = new Set(['n̪', 'n', 'ɲ', 'ŋ'].map((m) => m.normalize('NFD')));

/** Coordinates of p in the triangle's own axes: p = origin + s·(base − origin) + t·(apex − origin). */
function local(p: Point, { origin, apex, base }: Triangle): [s: number, t: number] {
  const u = sub(base, origin);
  const v = sub(apex, origin);
  const d = sub(p, origin);
  const det = u.x * v.y - u.y * v.x;
  return [(d.x * v.y - d.y * v.x) / det, (u.x * d.y - u.y * d.x) / det];
}

function mapPoint(p: Point, from: Triangle, to: Triangle): Point {
  const [s, t] = local(p, from);
  const u = sub(to.base, to.origin);
  const v = sub(to.apex, to.origin);
  return pt(to.origin.x + s * u.x + t * v.x, to.origin.y + s * u.y + t * v.y);
}

/** Points along a stroke, enough to test where it lies or to redraw an arc. */
function samples(s: Stroke, steps = 16): Point[] {
  if (s.kind === 'line') return [s.a, s.b];
  const TAU = Math.PI * 2;
  // Canvas arcs here run anticlockwise, that is with decreasing angle.
  const [start, sweep] =
    s.kind === 'arc' ? [s.start, (((s.start - s.end) % TAU) + TAU) % TAU] : [0, TAU];
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = start - (sweep * i) / steps;
    return pt(s.c.x + s.r * Math.cos(angle), s.c.y + s.r * Math.sin(angle));
  });
}

/** True when every stroke stays inside the glyph's own triangle. */
export function staysInside(built: Built, slack = 0.03): boolean {
  return built.strokes.every((stroke) =>
    samples(stroke, 8).every((p) => {
      const [s, t] = local(p, built.frame);
      return s >= -slack && t >= -slack && s + t <= 1 + slack;
    }),
  );
}

/** Redraw strokes from one triangle into another. */
function mapStrokes(strokes: readonly Stroke[], from: Triangle, to: Triangle, shrink: number): Stroke[] {
  const out: Stroke[] = [];
  // The bars inside a nasal circle must shrink with it, or they poke out.
  const hubs = new Map<string, Point>();
  for (const s of strokes) {
    if (s.kind === 'circle' && s.by && NASAL_MARKS.has(s.by)) hubs.set(s.by, s.c);
  }
  for (const s of strokes) {
    const hub = s.by ? hubs.get(s.by) : undefined;
    if (s.kind === 'line' && hub) {
      const centre = mapPoint(hub, from, to);
      const around = (p: Point) => add(centre, scale(sub(p, hub), shrink));
      out.push({ ...s, a: around(s.a), b: around(s.b) });
    } else if (s.kind === 'line') {
      out.push({ ...s, a: mapPoint(s.a, from, to), b: mapPoint(s.b, from, to) });
    } else if (s.kind === 'arc') {
      // A squashed arc is no longer part of a circle, so it becomes short lines.
      const points = samples(s).map((p) => mapPoint(p, from, to));
      for (let i = 1; i < points.length; i++) {
        out.push({ kind: 'line', a: points[i - 1], b: points[i], by: s.by });
      }
    } else {
      out.push({ ...s, c: mapPoint(s.c, from, to), r: s.r * shrink });
    }
  }
  return out;
}

/** Slide points and strokes by a fixed amount. */
function shiftBy(d: Point) {
  const point = (p: Point) => add(p, d);
  const stroke = (s: Stroke): Stroke =>
    s.kind === 'line' ? { ...s, a: point(s.a), b: point(s.b) } : { ...s, c: point(s.c) };
  return { point, stroke };
}

/** The quarter of the square at (x, y) that a slot names, as a glyph frame. */
function quarter(slot: Slot, x: number, y: number, side: number): Triangle {
  const apex = pt(x + side / 2, y + side / 2);
  const [tl, tr, bl, br] = [pt(x, y), pt(x + side, y), pt(x, y + side), pt(x + side, y + side)];
  // Corner order matches frame() in glyph.ts, so nothing is mirrored.
  switch (slot) {
    case 'bottom':
      return { origin: bl, base: br, apex };
    case 'top':
      return { origin: tr, base: tl, apex };
    case 'right':
      return { origin: br, base: tr, apex };
    case 'left':
      return { origin: tl, base: bl, apex };
  }
}

type Syllable = Extract<Token, { kind: 'syllable' }>;

/** True when no stroke passes beyond the base side of the glyph's triangle. */
export function clearOfBase(built: Built, slack = 0.03): boolean {
  return built.strokes.every((stroke) =>
    samples(stroke, 8).every((p) => local(p, built.frame)[1] >= -slack),
  );
}

/** The two halves of a diamond in the square at (x, y): an up triangle on a down one. */
function diamond(x: number, y: number, side: number): [upper: Triangle, lower: Triangle] {
  const [l, r] = [pt(x, y + side / 2), pt(x + side, y + side / 2)];
  return [
    { origin: l, base: r, apex: pt(x + side / 2, y) },
    { origin: r, base: l, apex: pt(x + side / 2, y + side) },
  ];
}

type Shape =
  | { kind: 'alone'; index: number }
  | { kind: 'square'; members: { index: number; built: Built; slot: Slot }[] }
  | { kind: 'diamond'; upper: { index: number; built: Built }; lower: { index: number; built: Built } };

/** Sort one word's glyphs into shapes. */
function pack(tokens: readonly Token[], from: number, to: number, unit: number): Shape[] {
  const shapes: Shape[] = [];
  let open: { shape: Extract<Shape, { kind: 'square' }>; rank: number } | undefined;
  const build = (t: Syllable) => buildSyllable(t.vowel, t.consonants, unit);
  const dir = (t: Token | undefined) => (t?.kind === 'syllable' ? VOWEL_SHAPES[t.vowel].dir : undefined);

  for (let index = from; index < to; index++) {
    const t = tokens[index];
    if (t.kind !== 'syllable') {
      if (t.kind === 'syllabic') shapes.push({ kind: 'alone', index });
      open = undefined;
      continue;
    }
    const built = build(t);
    const slot = SLOT_FOR[VOWEL_SHAPES[t.vowel].dir];
    const rank = SLOT_ORDER.indexOf(slot);
    const inside = staysInside(built);

    // First choice: join the square that is being filled.
    if (inside && open && rank > open.rank) {
      open.shape.members.push({ index, built, slot });
      open.rank = rank;
      continue;
    }
    // Second: an i on top of the a that follows it.
    const next = index + 1 < to ? tokens[index + 1] : undefined;
    if (t.vowel === 'i' && next?.kind === 'syllable' && dir(next) === 'down' && clearOfBase(built)) {
      const below = build(next);
      if (clearOfBase(below)) {
        shapes.push({ kind: 'diamond', upper: { index, built }, lower: { index: index + 1, built: below } });
        open = undefined;
        index++;
        continue;
      }
    }
    // Otherwise it starts a square of its own if it can, or stands alone.
    if (inside) {
      open = { shape: { kind: 'square', members: [{ index, built, slot }] }, rank };
      shapes.push(open.shape);
    } else {
      shapes.push({ kind: 'alone', index });
      open = undefined;
    }
  }
  // A square that never found a second member is just a glyph standing alone.
  return shapes.map((s) =>
    s.kind === 'square' && s.members.length === 1 ? { kind: 'alone', index: s.members[0].index } : s,
  );
}

/**
 * Lay tokens out with interlocking shapes. Returns the same structure as
 * layout(); each glyph also carries the number of the shape it belongs to.
 */
export function tessellate(
  tokens: readonly Token[],
  unit: number,
  maxWidth = Infinity,
  gloss = false,
): Layout {
  const side = squareSide(unit);
  const extra = gloss ? glossHeight(unit) : 0;
  const step = lineHeight(unit) + extra;
  const shrink = side / 2 / (HEIGHT * unit);
  // Shapes stand on the same baseline as the glyphs of the ordinary line.
  const baseline = (y: number) => y + (TONE + HEIGHT + 2) * unit;

  const glyphs: Placed[] = [];
  let x = 0;
  let y = 0;
  let width = 0;
  let cell = 0;

  /** Place the glyphs of one shape, drawn at x = 0, against what came before. */
  const place = (drawn: { index: number; strokes: Stroke[]; frame: Frame }[]) => {
    const xs = drawn.flatMap((g) => [
      g.frame.origin.x,
      g.frame.apex.x,
      g.frame.base.x,
      ...g.strokes.flatMap((st) => samples(st, 8).map((p) => p.x)),
    ]);
    const left = Math.min(...xs);
    const advance = Math.max(...xs) - left;
    const move = shiftBy(pt(x - left, 0));
    for (const g of drawn) {
      const { origin, apex, base, open } = g.frame;
      glyphs.push({
        index: g.index,
        at: pt(x, y),
        advance,
        cell,
        strokes: g.strokes.map(move.stroke),
        frame: { origin: move.point(origin), apex: move.point(apex), base: move.point(base), open },
      });
    }
    x += advance;
  };

  let i = 0;
  while (i < tokens.length) {
    const kind = tokens[i].kind;
    if (kind === 'space') {
      x += spaceWidth(unit);
      i++;
      continue;
    }
    if (kind === 'newline') {
      x = 0;
      y += step;
      i++;
      continue;
    }
    let end = i;
    while (end < tokens.length && tokens[end].kind !== 'space' && tokens[end].kind !== 'newline') end++;
    const shapes = pack(tokens, i, end, unit);

    // Measure the word before placing it, so that it wraps whole.
    const wordStart = glyphs.length;
    const x0 = x;
    const top = baseline(y) - side;
    for (const shape of shapes) {
      if (shape.kind === 'alone') {
        // Exactly what the ordinary line would draw here.
        const t = tokens[shape.index];
        const at = pt(x, y);
        const built =
          t.kind === 'syllable'
            ? buildSyllable(t.vowel, t.consonants, unit, at)
            : buildSyllabicConsonant((t as Extract<Token, { kind: 'syllabic' }>).letter, unit, at);
        glyphs.push({ index: shape.index, at, advance: built.advance, cell, strokes: built.strokes, frame: built.frame });
        x += built.advance;
      } else if (shape.kind === 'square') {
        place(
          shape.members.map(({ index, built, slot }) => {
            const target = quarter(slot, 0, top, side);
            return {
              index,
              strokes: mapStrokes(built.strokes, built.frame, target, shrink),
              frame: { ...target, open: built.frame.open },
            };
          }),
        );
      } else {
        const halves = diamond(0, top, side);
        place(
          [shape.upper, shape.lower].map(({ index, built }, n) => ({
            index,
            strokes: mapStrokes(built.strokes, built.frame, halves[n], shrink),
            frame: { ...halves[n], open: built.frame.open },
          })),
        );
      }
      cell++;
    }
    if (x0 > 0 && x > maxWidth) {
      // Too wide for what is left of this line: move the whole word down.
      const back = shiftBy(pt(-x0, step));
      for (let g = wordStart; g < glyphs.length; g++) {
        const { origin, apex, base, open } = glyphs[g].frame;
        glyphs[g] = {
          ...glyphs[g],
          at: back.point(glyphs[g].at),
          strokes: glyphs[g].strokes.map(back.stroke),
          frame: { origin: back.point(origin), apex: back.point(apex), base: back.point(base), open },
        };
      }
      x -= x0;
      y += step;
    }
    width = Math.max(width, x);
    i = end;
  }

  return { glyphs, width, height: y + rowHeight(unit) + extra };
}
