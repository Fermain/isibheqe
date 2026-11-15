/**
 * An experimental second way to lay text out: tessellated, after the
 * coloured rendering of "Ditema tsa Dinoko" on the script's Wikipedia page.
 *
 * In that image every glyph is a quarter of a square cut by its diagonals.
 * The vowel decides which quarter: i and u (apex up) sit in the bottom
 * quarter, a (apex down) in the top, e and ɛ (apex left) in the right, o and
 * ɔ (apex right) in the left, so that all four apexes meet in the middle.
 * A square can hold up to four syllables.
 *
 * Two things here are this experiment's own and are not taken from any
 * source:
 *   - The quarters of a square are flatter than the designed triangle
 *     (height half the base, against 13.8 : 16), so each glyph is squashed
 *     along its axis to fit. Lines keep their meeting points; circles stay
 *     round and shrink by the same factor. core/glyph.ts is not touched.
 *   - Reading order inside a square is fixed as left, top, bottom, right.
 *     A syllable joins the current square only if its quarter comes later
 *     in that order than the last one filled; otherwise it starts a new
 *     square. The image is consistent with this rule but does not state it.
 *
 * A glyph with marks outside its triangle (a nasal circle on the apex, the
 * p bar, l, j …) would run into its neighbours, so it takes a square alone,
 * as "ma" and "no" do in the image. Words always start a new square.
 */
import { BASE, HEIGHT, add, mid, pt, scale, sub, type Frame, type Point, type Stroke } from './geometry';
import { VOWEL_SHAPES, buildSyllabicConsonant, buildSyllable, type Built } from './glyph';
import { glossHeight, lineHeight, rowHeight, type Layout, type Placed, type Token } from './text';

export type Slot = 'left' | 'top' | 'bottom' | 'right';
const SLOT_ORDER: readonly Slot[] = ['left', 'top', 'bottom', 'right'];
/** The quarter a vowel's triangle fills: opposite to the way its apex points. */
const SLOT_FOR = { right: 'left', down: 'top', up: 'bottom', left: 'right' } as const;

export const squareSide = (unit: number) => BASE * unit;
/** Room above each square, inside the row. */
const topMargin = (unit: number) => unit * 4;
/** Gap between words, on top of starting a new square. */
const wordGap = (unit: number) => squareSide(unit) / 2;

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

interface Member {
  index: number;
  built: Built;
  /** The quarter it fills; undefined for a syllabic nasal, which sits in the middle. */
  slot?: Slot;
}

/** Sort one word's glyphs into squares. */
function pack(tokens: readonly Token[], from: number, to: number, unit: number): Member[][] {
  const squares: Member[][] = [];
  let open: { members: Member[]; rank: number } | undefined;
  for (let index = from; index < to; index++) {
    const t = tokens[index];
    if (t.kind === 'syllabic') {
      squares.push([{ index, built: buildSyllabicConsonant(t.letter, unit) }]);
      open = undefined;
    } else if (t.kind === 'syllable') {
      const built = buildSyllable(t.vowel, t.consonants, unit);
      const slot = SLOT_FOR[VOWEL_SHAPES[t.vowel].dir];
      const rank = SLOT_ORDER.indexOf(slot);
      const member = { index, built, slot };
      if (!staysInside(built)) {
        squares.push([member]);
        open = undefined;
      } else if (open && rank > open.rank) {
        open.members.push(member);
        open.rank = rank;
      } else {
        open = { members: [member], rank };
        squares.push(open.members);
      }
    }
  }
  return squares;
}

/**
 * Lay tokens out as tessellated squares. Returns the same shape as layout(),
 * with each glyph also carrying the number of the square it sits in.
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

  const glyphs: Placed[] = [];
  let x = 0;
  let y = 0;
  let width = 0;
  let cell = 0;

  let i = 0;
  while (i < tokens.length) {
    const kind = tokens[i].kind;
    if (kind === 'space') {
      x += wordGap(unit);
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
    const squares = pack(tokens, i, end, unit);
    if (x > 0 && x + squares.length * side > maxWidth) {
      x = 0;
      y += step;
    }
    for (const members of squares) {
      const top = y + topMargin(unit);
      for (const { index, built, slot } of members) {
        const at = pt(x, y);
        if (slot) {
          const target = quarter(slot, x, top, side);
          glyphs.push({
            index,
            at,
            advance: side,
            cell,
            strokes: mapStrokes(built.strokes, built.frame, target, shrink),
            frame: { ...target, open: built.frame.open },
          });
        } else {
          // A syllabic nasal keeps its size and is centred in the square.
          const { origin, apex, base } = built.frame;
          const shift = sub(pt(x + side / 2, top + side / 2), mid(mid(origin, base), apex));
          const move = (p: Point) => add(p, shift);
          glyphs.push({
            index,
            at,
            advance: side,
            cell,
            strokes: built.strokes.map((s) =>
              s.kind === 'line' ? { ...s, a: move(s.a), b: move(s.b) } : { ...s, c: move(s.c) },
            ),
            frame: { origin: move(origin), apex: move(apex), base: move(base), open: false },
          });
        }
      }
      x += side;
      width = Math.max(width, x);
      cell++;
    }
    i = end;
  }

  return { glyphs, width, height: y + rowHeight(unit) + extra };
}
