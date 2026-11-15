/**
 * The arranging board: glyphs placed by hand on a lattice of triangles,
 * under rules that keep the result readable.
 *
 * The lattice is the script's own triangle repeated: rows as high as the
 * designed glyph, cut by lines at its own slant, so that triangles pointing
 * up and down alternate along each row. A place on it is a row and a step
 * along the row, half a base wide.
 *
 *   - i and u (apex up) fill a triangle that points up, a (apex down) one
 *     that points down, at exactly their designed size. Neighbours in a row
 *     share a side; an i above an a shares its base.
 *   - e, ɛ, o and ɔ point sideways and no triangle of this lattice does.
 *     Small, they are scaled to the height of a row and stand in it like any
 *     other glyph. Large, they are 1.73 times the designed size, two rows
 *     high, which puts all three corners on points of the lattice.
 *   - A syllabic nasal is its designed circle, one row high.
 *
 * A glyph can never be turned or mirrored: direction is the vowel.
 *
 * The rules, all of them this site's own:
 *   lattice   an upright glyph sits only in a triangle that points its way
 *   taken     no two glyphs may overlap
 *   trespass  a mark outside its own triangle takes up the triangle of the
 *             lattice it lies in, and no other glyph may sit there; nor may
 *             a mark lie along another glyph's lines, where it would vanish
 *   closed    no line may close the open base of u, e or o
 *   order     reading each word left to right, and from the top where two
 *             glyphs start at the same step, must give the text
 *   apart     every glyph of a word is next to another glyph of that word
 * Words follow each other left to right. After every move the board pulls
 * each glyph as far left as these rules allow, which closes any space left
 * behind and keeps words a base apart.
 */
import { BASE, HEIGHT, add, mid, pt, scale, sub, type Frame, type Point, type Stroke } from './geometry';
import { VOWEL_SHAPES, buildSyllabicConsonant, buildSyllable } from './glyph';
import { local, mapStrokes, samples } from './tessellate';
import type { Layout, Placed, Token } from './text';

export interface Tile {
  /** Index of the token this glyph writes. */
  index: number;
  /** Which word of the text it belongs to, counting from 0. */
  word: number;
  /** Step along the row, in half bases, of the glyph's left edge. */
  k: number;
  /** Row of the glyph's top edge. */
  row: number;
  /** A sideways glyph drawn two rows high. */
  large?: boolean;
}

export type Rule = 'lattice' | 'taken' | 'trespass' | 'closed' | 'order' | 'apart';

export interface Violation {
  rule: Rule;
  message: string;
  /** Token indexes of the glyphs involved. */
  tiles: number[];
}

/** Width of one step and height of one row. */
export const step = (unit: number) => (BASE / 2) * unit;
export const rowHeight = (unit: number) => HEIGHT * unit;

type Glyph = Extract<Token, { kind: 'syllable' | 'syllabic' }>;
const isGlyph = (t: Token | undefined): t is Glyph => t?.kind === 'syllable' || t?.kind === 'syllabic';

function name(t: Token): string {
  if (!isGlyph(t)) return '';
  if (t.source) return t.source;
  return t.kind === 'syllabic' ? t.letter : t.consonants.join('') + t.vowel;
}

/** Which way a glyph's triangle points; undefined for a syllabic nasal. */
export function direction(tile: Tile, tokens: readonly Token[]) {
  const t = tokens[tile.index];
  return t.kind === 'syllable' ? VOWEL_SHAPES[t.vowel].dir : undefined;
}

/** True for e and o glyphs, the only ones that come in two sizes. */
export function sideways(tile: Tile, tokens: readonly Token[]): boolean {
  const dir = direction(tile, tokens);
  return dir === 'left' || dir === 'right';
}

/** How many steps wide and rows high a tile is. */
const span = (tile: Tile) => (tile.large ? { steps: 3, rows: 2 } : { steps: 2, rows: 1 });

/** True when the tile sits where the lattice has a triangle pointing its way. */
function fits(tile: Tile, tokens: readonly Token[]): boolean {
  const dir = direction(tile, tokens);
  const even = (((tile.k + tile.row) % 2) + 2) % 2 === 0;
  if (dir === 'up') return even;
  if (dir === 'down') return !even;
  if (tile.large) return dir === 'right' ? even : !even;
  return true;
}

/**
 * Put the board's corner at the start: rows count from 0 and the first glyph
 * starts at step 0 or 1. Everything moves by a whole base (or by a step and a
 * row together), so every glyph keeps a triangle that points its way.
 */
export function normalise(tiles: readonly Tile[]): Tile[] {
  if (tiles.length === 0) return [];
  const minRow = Math.min(...tiles.map((t) => t.row));
  const lifted = tiles.map((t) => ({ ...t, row: t.row - minRow, k: t.k + (((minRow % 2) + 2) % 2) }));
  const first = Math.min(...lifted.map((t) => t.k));
  const shift = first - (((first % 2) + 2) % 2);
  return lifted.map((t) => ({ ...t, k: t.k - shift })).sort((a, b) => a.index - b.index);
}

/** Steps between the end of one word and the start of the next. */
const WORD_GAP = 2;

/**
 * Tidy an arrangement: pull every glyph, and everything after it, as far
 * left as the rules allow, a whole base at a time, keeping words apart.
 * This is what closes the space a glyph leaves behind when it is moved.
 */
export function settle(tiles: readonly Tile[], tokens: readonly Token[], unit = 1): Tile[] {
  let now = normalise(tiles);
  const wordsApart = (list: Tile[]) => {
    const words = [...new Set(list.map((t) => t.word))].sort((a, b) => a - b);
    return words.every((word, i) => {
      if (i === 0) return true;
      const end = Math.max(...list.filter((t) => t.word === words[i - 1]).map((t) => t.k + span(t).steps));
      return Math.min(...list.filter((t) => t.word === word).map((t) => t.k)) - end >= WORD_GAP;
    });
  };
  if (check(now, tokens, unit, true) || !wordsApart(now)) return now;
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let j = 1; j < now.length; j++) {
      const from = now[j].index;
      const pulled = now.map((t) => (t.index >= from ? { ...t, k: t.k - 2 } : t));
      if (wordsApart(pulled) && !check(pulled, tokens, unit, true)) {
        now = pulled;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return normalise(now);
}

/** Points all along a stroke, close enough together to test where it runs. */
function along(st: Stroke): Point[] {
  if (st.kind !== 'line') return samples(st, 16);
  return Array.from({ length: 13 }, (_, i) => add(st.a, scale(sub(st.b, st.a), i / 12)));
}

interface Drawn {
  strokes: Stroke[];
  frame: Frame;
  /** A syllabic nasal is a circle, not a triangle. */
  disc?: { c: Point; r: number };
}

/** One tile's strokes, in board coordinates (step 0 of row 0 starts at the origin). */
export function draw(tile: Tile, tokens: readonly Token[], unit: number): Drawn {
  const t = tokens[tile.index] as Glyph;
  const left = tile.k * step(unit);
  const top = tile.row * rowHeight(unit);
  const built = t.kind === 'syllable' ? buildSyllable(t.vowel, t.consonants, unit) : buildSyllabicConsonant(t.letter, unit);
  const { origin, apex, base, open } = built.frame;

  if (t.kind === 'syllabic') {
    const shift = sub(pt(left + step(unit), top + rowHeight(unit) / 2), mid(mid(origin, base), apex));
    const move = (p: Point) => add(p, shift);
    return {
      strokes: built.strokes.map(
        (st): Stroke => (st.kind === 'line' ? { ...st, a: move(st.a), b: move(st.b) } : { ...st, c: move(st.c) }),
      ),
      frame: { origin: move(origin), apex: move(apex), base: move(base), open: false },
      disc: { c: pt(left + step(unit), top + rowHeight(unit) / 2), r: (HEIGHT / 2) * unit },
    };
  }

  const dir = VOWEL_SHAPES[t.vowel].dir;
  if (tile.large && (dir === 'left' || dir === 'right')) {
    // Two rows high, three steps long: every corner on a point of the lattice.
    const [x0, x1] = [left, left + 3 * step(unit)];
    const [y0, y1, y2] = [top, top + rowHeight(unit), top + 2 * rowHeight(unit)];
    const target =
      dir === 'right'
        ? { origin: pt(x0, y0), base: pt(x0, y2), apex: pt(x1, y1) }
        : { origin: pt(x1, y2), base: pt(x1, y0), apex: pt(x0, y1) };
    return {
      strokes: mapStrokes(built.strokes, built.frame, target, (2 * HEIGHT) / BASE),
      frame: { ...target, open },
    };
  }

  // Upright glyphs keep their designed size; small sideways ones are scaled to the height of the row.
  const k = dir === 'up' || dir === 'down' ? 1 : HEIGHT / BASE;
  const xs = [origin.x, apex.x, base.x];
  const ys = [origin.y, apex.y, base.y];
  // A glyph pointing left has its base at the right of its place; the others start at the left.
  const anchorX = dir === 'left' ? left + 2 * step(unit) - (Math.max(...xs) - Math.min(...xs)) * k : left;
  const move = (p: Point) => pt(anchorX + (p.x - Math.min(...xs)) * k, top + (p.y - Math.min(...ys)) * k);
  return {
    strokes: built.strokes.map(
      (st): Stroke => (st.kind === 'line' ? { ...st, a: move(st.a), b: move(st.b) } : { ...st, c: move(st.c), r: st.r * k }),
    ),
    frame: { origin: move(origin), apex: move(apex), base: move(base), open },
  };
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const length2 = ab.x * ab.x + ab.y * ab.y;
  const k = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / length2));
  return distance(p, add(a, scale(ab, k)));
}

/** The triangle of the lattice a point lies in, and how far inside it the point is. */
function cellAt(p: Point, unit: number): { k: number; row: number; depth: number } | undefined {
  const row = Math.floor(p.y / rowHeight(unit));
  const down = (p.y - row * rowHeight(unit)) / rowHeight(unit); // 0 at the top of the row, 1 at the bottom
  const u = p.x / step(unit);
  for (const k of [Math.floor(u) - 1, Math.floor(u)]) {
    const pointsUp = (((k + row) % 2) + 2) % 2 === 0;
    // How much narrower the triangle is at this height than at its base, on each side, in steps.
    const narrowing = pointsUp ? 1 - down : down;
    const [fromLeft, fromRight] = [u - (k + narrowing), k + 2 - narrowing - u];
    if (fromLeft < 0 || fromRight < 0) continue;
    const slant = Math.sin(Math.PI / 3) * step(unit);
    const fromBase = (pointsUp ? 1 - down : down) * rowHeight(unit);
    return { k, row, depth: Math.min(fromLeft * slant, fromRight * slant, fromBase) };
  }
  return undefined;
}

/** True when two tiles are next to each other: within two bases sideways, in touching rows. */
function beside(a: Tile, b: Tile): boolean {
  const gap = Math.max(a.k, b.k) - Math.min(a.k + span(a).steps, b.k + span(b).steps);
  const rows = Math.max(a.row, b.row) - Math.min(a.row + span(a).rows, b.row + span(b).rows);
  return gap <= 4 && rows <= 0;
}

/**
 * The first rule an arrangement breaks, if any. With `loose`, glyphs need not
 * be next to each other (used while a line is still being laid out).
 */
export function check(
  tiles: readonly Tile[],
  tokens: readonly Token[],
  unit = 1,
  loose = false,
): Violation | undefined {
  const label = (t: Tile) => `“${name(tokens[t.index])}”`;

  for (const t of tiles) {
    if (fits(t, tokens)) continue;
    const way = direction(t, tokens) === 'up' ? 'up' : direction(t, tokens) === 'down' ? 'down' : 'that way';
    return {
      rule: 'lattice',
      message: `${label(t)} points ${way}, and the triangle there points the other way.`,
      tiles: [t.index],
    };
  }

  for (let i = 1; i < tiles.length; i++) {
    const [a, b] = [tiles[i - 1], tiles[i]];
    if (a.word !== b.word) continue;
    if (!(b.k > a.k || (b.k === a.k && b.row > a.row))) {
      return {
        rule: 'order',
        message: `That would change the reading: ${label(b)} would be read before ${label(a)}.`,
        tiles: [a.index, b.index],
      };
    }
  }

  if (!loose) {
    for (const word of new Set(tiles.map((t) => t.word))) {
      const mine = tiles.filter((t) => t.word === word);
      const reached = new Set([mine[0]]);
      const queue = [mine[0]];
      while (queue.length > 0) {
        const at = queue.pop()!;
        for (const t of mine) {
          if (!reached.has(t) && beside(t, at)) {
            reached.add(t);
            queue.push(t);
          }
        }
      }
      const stray = mine.find((t) => !reached.has(t));
      if (stray) {
        return {
          rule: 'apart',
          message: `That would leave ${label(stray)} cut off from the rest of its word.`,
          tiles: [stray.index],
        };
      }
    }
  }

  const drawn = tiles.map((t) => draw(t, tokens, unit));
  const inside = (p: Point, d: Drawn, slack: number) => {
    if (d.disc) return distance(p, d.disc.c) < d.disc.r - slack * unit;
    const [s, t] = local(p, d.frame);
    return s > slack && t > slack && s + t < 1 - slack;
  };
  /** Points along the outline of a glyph's triangle (or its circle). */
  const outline = drawn.map((d) => {
    if (d.disc) return samples({ kind: 'circle', c: d.disc.c, r: d.disc.r }, 16);
    const { origin, apex, base } = d.frame;
    return [[origin, apex], [apex, base], [base, origin]].flatMap(([p, q]) =>
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((k) => add(p, scale(sub(q, p), k))),
    );
  });
  // The points of each glyph's marks that lie outside its own triangle.
  const outside = drawn.map((d) => {
    if (d.disc) return [];
    const { origin, apex, base } = d.frame;
    const own = (p: Point) =>
      Math.min(distanceToSegment(p, origin, apex), distanceToSegment(p, apex, base), distanceToSegment(p, base, origin));
    return d.strokes.flatMap((st) =>
      along(st)
        .filter((p) => !inside(p, d, -0.03))
        .map((p) => ({ p, by: st.by, loose: own(p) > unit * 1.5 })),
    );
  });
  // The triangles of the lattice those marks take up: any they reach well into.
  const taken = outside.map((points) => {
    const cells = new Set<string>();
    for (const { p } of points) {
      const cell = cellAt(p, unit);
      if (cell && cell.depth > unit * 0.6) cells.add(`${cell.k},${cell.row}`);
    }
    return cells;
  });
  /** True when a mark lies along one of another glyph's strokes. Where it joins its own triangle does not count. */
  const along_ = ({ p, by, loose }: { p: Point; by?: string; loose: boolean }, d: Drawn) =>
    loose &&
    d.strokes.some((st) => {
      // Two p bars may meet end to end, as they do in ordinary writing.
      if (by === 'p' && st.by === 'p') return false;
      if (st.kind === 'line') return distanceToSegment(p, st.a, st.b) < unit * 0.35;
      if (st.kind === 'arc') return samples(st, 8).some((q) => distance(p, q) < unit * 0.35);
      const gap = distance(p, st.c) - st.r;
      return st.kind === 'dot' ? gap < unit * 0.35 : Math.abs(gap) < unit * 0.35;
    });

  for (let a = 0; a < tiles.length; a++) {
    for (let b = 0; b < tiles.length; b++) {
      if (a === b || Math.abs(tiles[a].k - tiles[b].k) > 6 || Math.abs(tiles[a].row - tiles[b].row) > 3) continue;
      if (a < b && (outline[a].some((p) => inside(p, drawn[b], 0.04)) || outline[b].some((p) => inside(p, drawn[a], 0.04)))) {
        return {
          rule: 'taken',
          message: `${label(tiles[a])} and ${label(tiles[b])} would overlap.`,
          tiles: [tiles[a].index, tiles[b].index],
        };
      }
      const upright = direction(tiles[b], tokens) === 'up' || direction(tiles[b], tokens) === 'down';
      const inTheWay = upright
        ? taken[a].has(`${tiles[b].k},${tiles[b].row}`)
        : outside[a].some(({ p }) => inside(p, drawn[b], 0.03));
      if (inTheWay) {
        return {
          rule: 'trespass',
          message: `${label(tiles[b])} would sit where the marks of ${label(tiles[a])} are.`,
          tiles: [tiles[a].index, tiles[b].index],
        };
      }
      if (outside[a].some((point) => along_(point, drawn[b]))) {
        return {
          rule: 'trespass',
          message: `A mark of ${label(tiles[a])} would lie along a line of ${label(tiles[b])} and could not be seen.`,
          tiles: [tiles[a].index, tiles[b].index],
        };
      }
    }
  }

  for (let b = 0; b < tiles.length; b++) {
    const { frame } = drawn[b];
    if (!frame.open) continue;
    const base = [0.2, 0.35, 0.5, 0.65, 0.8].map((k) => add(frame.origin, scale(sub(frame.base, frame.origin), k)));
    for (let a = 0; a < tiles.length; a++) {
      if (a === b) continue;
      const lines = drawn[a].strokes.filter((st) => st.kind === 'line');
      const covered = base.filter((p) =>
        lines.some((st) => st.kind === 'line' && distanceToSegment(p, st.a, st.b) < unit / 4),
      );
      // Even a line along part of the open side makes the vowel doubtful.
      if (covered.length >= 2) {
        return {
          rule: 'closed',
          message: `${label(tiles[a])} would close the open side of ${label(tiles[b])}, which would then read as a different vowel.`,
          tiles: [tiles[a].index, tiles[b].index],
        };
      }
    }
  }
  return undefined;
}

/**
 * The starting arrangement: one row, each glyph as close to the one before
 * as the rules allow. Triangles pointing up and down nestle by themselves.
 */
export function lineUp(tokens: readonly Token[], unit = 1): Tile[] {
  const tiles: Tile[] = [];
  let word = 0;
  let from = 0;
  tokens.forEach((t, index) => {
    if (!isGlyph(t)) {
      if (tiles.length > 0 && tiles[tiles.length - 1].word === word) {
        word++;
        from = Math.max(...tiles.map((p) => p.k + span(p).steps)) + WORD_GAP;
      }
      return;
    }
    for (let k = from; k < from + 16; k++) {
      const tile: Tile = { index, word, k, row: 0 };
      if (!fits(tile, tokens) || check([...tiles, tile], tokens, unit, true)) continue;
      tiles.push(tile);
      from = k + 1;
      return;
    }
    // Nothing fitted nearby (it should not happen): give it clear room.
    tiles.push({ index, word, k: from + 16 + (fits({ index, word, k: from + 16, row: 0 }, tokens) ? 0 : 1), row: 0 });
    from = tiles[tiles.length - 1].k + 1;
  });
  return settle(tiles, tokens, unit);
}

export interface Target {
  k: number;
  row: number;
  /** True when room is made for the glyph here, pushing later glyphs along. */
  insert: boolean;
  /** The arrangement this move gives, tidied. */
  tiles: Tile[];
  violation?: Violation;
}

const signature = (tiles: readonly Tile[]) => tiles.map((t) => `${t.k},${t.row},${t.large ? 1 : 0}`).join(' ');

/**
 * Every place one glyph could be moved to: each step across its word and a
 * little beyond, one row beyond the board in each direction, with and
 * without making room. Each comes with the arrangement it would give and the
 * rule it would break, if any. Places where the lattice points the other way
 * are left out.
 */
export function targets(tiles: readonly Tile[], tokens: readonly Token[], index: number, unit = 1): Target[] {
  const tile = tiles.find((t) => t.index === index);
  if (!tile) return [];
  const mine = tiles.filter((t) => t.word === tile.word);
  const first = Math.min(...mine.map((t) => t.k));
  const last = Math.max(...mine.map((t) => t.k + span(t).steps));
  const rows = tiles.map((t) => t.row);
  const [top, bottom] = [Math.min(...rows) - 2, Math.max(...rows) + 1];
  const seen = new Set([signature(tiles)]);
  const out: Target[] = [];
  for (const insert of [false, true]) {
    for (let k = first - 3; k <= last + 1; k++) {
      for (let row = top; row <= bottom; row++) {
        if (!fits({ ...tile, k, row }, tokens)) continue;
        const moved = settle(
          tiles.map((t) => {
            if (t.index === index) return { ...t, k, row };
            return insert && t.index > index && t.k >= k ? { ...t, k: t.k + 2 } : t;
          }),
          tokens,
          unit,
        );
        const key = signature(moved);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ k, row, insert, tiles: moved, violation: check(moved, tokens, unit) });
      }
    }
  }
  return out;
}

export interface BoardLayout extends Layout {
  /** The step and row at the top left of the view. */
  origin: { k: number; row: number };
  steps: number;
  rows: number;
}

/** The board as a Layout, so that the SVG and colour code can draw it. Margins are in steps and rows. */
export function boardLayout(
  tiles: readonly Tile[],
  tokens: readonly Token[],
  unit: number,
  margin: { steps: number; rows: number },
): BoardLayout {
  const firstK = Math.min(...tiles.map((t) => t.k));
  const lastK = Math.max(...tiles.map((t) => t.k + span(t).steps));
  const firstRow = Math.min(...tiles.map((t) => t.row));
  const lastRow = Math.max(...tiles.map((t) => t.row + span(t).rows));
  const origin = { k: firstK - margin.steps, row: firstRow - margin.rows };
  const steps = lastK - firstK + margin.steps * 2;
  const rows = lastRow - firstRow + margin.rows * 2;
  const shift = (p: Point) => pt(p.x - origin.k * step(unit), p.y - origin.row * rowHeight(unit));
  const glyphs: Placed[] = tiles.map((tile) => {
    const { strokes, frame } = draw(tile, tokens, unit);
    return {
      index: tile.index,
      at: shift(pt(tile.k * step(unit), tile.row * rowHeight(unit))),
      advance: span(tile).steps * step(unit),
      strokes: strokes.map(
        (st): Stroke => (st.kind === 'line' ? { ...st, a: shift(st.a), b: shift(st.b) } : { ...st, c: shift(st.c) }),
      ),
      frame: { origin: shift(frame.origin), apex: shift(frame.apex), base: shift(frame.base), open: frame.open },
    };
  });
  return { glyphs, width: steps * step(unit), height: rows * rowHeight(unit), origin, steps, rows };
}
