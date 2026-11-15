/**
 * The arranging board: glyphs placed by hand on a lattice of squares cut by
 * their diagonals, under rules that keep the result readable.
 *
 * What a person may do with a glyph is move it to another square and choose
 * between two sizes. "Flat" fills the quarter of the square that its vowel
 * points away from, so flat glyphs interlock. "Full" is the designed glyph,
 * drawn a little smaller, alone in its square. A glyph can never be turned
 * or mirrored: in this script the direction of the triangle is the vowel.
 *
 * A glyph may also sit half a square to the side of its neighbour. That is
 * how a full triangle pointing up nestles against one pointing down, their
 * slanted sides running side by side, as they do in the ordinary line.
 *
 * The rules, all of them this site's own:
 *   taken     one glyph per quarter; a full glyph has its square to itself;
 *             no two triangles may overlap
 *   trespass  no mark outside its own triangle may land inside another
 *             glyph, or so close to another glyph's lines that it could be
 *             read as belonging there
 *   closed    no line may close the open base of u, e or o
 *   order     reading each word column by column, each column from the top,
 *             and each square left, top, bottom, right, must give the text
 *   apart     every glyph of a word touches another glyph of that word
 * Words follow each other left to right with one empty column between them;
 * the board keeps that spacing itself.
 */
import { BASE, HEIGHT, add, mid, pt, scale, sub, type Frame, type Point, type Stroke } from './geometry';
import { VOWEL_SHAPES, buildSyllabicConsonant, buildSyllable } from './glyph';
import { SLOT_FOR, SLOT_ORDER, local, mapStrokes, pack, quarter, samples, type Slot } from './tessellate';
import type { Layout, Placed, Token } from './text';

export interface Tile {
  /** Index of the token this glyph writes. */
  index: number;
  /** Which word of the text it belongs to, counting from 0. */
  word: number;
  /** Column, counted in squares. A half (0.5, 1.5 …) is a place between two squares. */
  col: number;
  row: number;
  size: 'flat' | 'full';
}

export type Rule = 'taken' | 'trespass' | 'closed' | 'order' | 'apart';

export interface Violation {
  rule: Rule;
  message: string;
  /** Token indexes of the glyphs involved. */
  tiles: number[];
}

/** How much smaller than designed a full glyph is drawn, to leave room around it. */
const FULL_SCALE = 0.8;
const side = (unit: number) => BASE * unit;

const isGlyph = (t: Token | undefined): t is Extract<Token, { kind: 'syllable' | 'syllabic' }> =>
  t?.kind === 'syllable' || t?.kind === 'syllabic';

function name(t: Token): string {
  if (!isGlyph(t)) return '';
  if (t.source) return t.source;
  return t.kind === 'syllabic' ? t.letter : t.consonants.join('') + t.vowel;
}

/** The quarter a flat tile fills, or undefined for a full one. */
export function slotOf(tile: Tile, tokens: readonly Token[]): Slot | undefined {
  const t = tokens[tile.index];
  return tile.size === 'flat' && t.kind === 'syllable' ? SLOT_FOR[VOWEL_SHAPES[t.vowel].dir] : undefined;
}

/**
 * Tidy the columns: close up any stretch inside a word that no glyph covers,
 * leave one empty square between words, and count rows from 0. Half-square
 * offsets between glyphs that overlap sideways are kept.
 */
export function normalise(tiles: readonly Tile[]): Tile[] {
  const words = [...new Set(tiles.map((t) => t.word))].sort((a, b) => a - b);
  const minRow = Math.min(...tiles.map((t) => t.row));
  const out: Tile[] = [];
  let offset = 0;
  for (const word of words) {
    const mine = tiles.filter((t) => t.word === word);
    // Work in half squares: a glyph covers the half it starts on and the next.
    const half = (t: Tile) => Math.round(t.col * 2);
    const covered = [...new Set(mine.flatMap((t) => [half(t), half(t) + 1]))].sort((a, b) => a - b);
    for (const t of mine) out.push({ ...t, col: (offset + covered.indexOf(half(t))) / 2, row: t.row - minRow });
    offset += covered.length + 2;
  }
  return out.sort((a, b) => a.index - b.index);
}

/** The starting arrangement: every glyph full size, in a line. */
export function lineUp(tokens: readonly Token[]): Tile[] {
  const tiles: Tile[] = [];
  let word = 0;
  let col = 0;
  tokens.forEach((t, index) => {
    if (isGlyph(t)) tiles.push({ index, word, col: col++, row: 0, size: 'full' });
    else if (tiles.length > 0 && tiles[tiles.length - 1].word === word) word++;
  });
  return tiles.length > 0 ? normalise(tiles) : [];
}

/** A first arrangement with some interlocking shapes, from the tessellation experiment. */
export function suggest(tokens: readonly Token[], unit = 1): Tile[] {
  const tiles: Tile[] = [];
  let word = 0;
  let col = 0;
  let i = 0;
  while (i < tokens.length) {
    if (!isGlyph(tokens[i])) {
      i++;
      continue;
    }
    let end = i;
    while (end < tokens.length && isGlyph(tokens[end])) end++;
    for (const shape of pack(tokens, i, end, unit)) {
      if (shape.kind === 'alone') tiles.push({ index: shape.index, word, col, row: 0, size: 'full' });
      else if (shape.kind === 'square') {
        for (const m of shape.members) tiles.push({ index: m.index, word, col, row: 0, size: 'flat' });
      } else {
        tiles.push({ index: shape.upper.index, word, col, row: 0, size: 'flat' });
        tiles.push({ index: shape.lower.index, word, col, row: 1, size: 'flat' });
      }
      col++;
    }
    word++;
    i = end;
  }
  if (tiles.length === 0) return [];
  const tidy = normalise(tiles);
  return check(tidy, tokens, unit) ? lineUp(tokens) : tidy;
}

interface Drawn {
  strokes: Stroke[];
  frame: Frame;
  /** A syllabic nasal is a circle, not a triangle. */
  disc?: { c: Point; r: number };
}

/** One tile's strokes, in board coordinates (square 0,0 has its corner at the origin). */
export function draw(tile: Tile, tokens: readonly Token[], unit: number): Drawn {
  const t = tokens[tile.index];
  const s = side(unit);
  const corner = pt(tile.col * s, tile.row * s);
  const slot = slotOf(tile, tokens);
  if (slot && t.kind === 'syllable') {
    const built = buildSyllable(t.vowel, t.consonants, unit);
    const target = quarter(slot, corner.x, corner.y, s);
    return {
      strokes: mapStrokes(built.strokes, built.frame, target, s / 2 / (HEIGHT * unit)),
      frame: { ...target, open: built.frame.open },
    };
  }
  const built =
    t.kind === 'syllable'
      ? buildSyllable(t.vowel, t.consonants, unit)
      : buildSyllabicConsonant((t as Extract<Token, { kind: 'syllabic' }>).letter, unit);
  const { origin, apex, base, open } = built.frame;
  const centre =
    t.kind === 'syllable'
      ? pt(
          (Math.min(origin.x, apex.x, base.x) + Math.max(origin.x, apex.x, base.x)) / 2,
          (Math.min(origin.y, apex.y, base.y) + Math.max(origin.y, apex.y, base.y)) / 2,
        )
      : mid(mid(origin, base), apex);
  const middle = add(corner, pt(s / 2, s / 2));
  const move = (p: Point) => add(middle, scale(sub(p, centre), FULL_SCALE));
  const strokes = built.strokes.map(
    (st): Stroke =>
      st.kind === 'line'
        ? { ...st, a: move(st.a), b: move(st.b) }
        : { ...st, c: move(st.c), r: st.r * FULL_SCALE },
  );
  return {
    strokes,
    frame: { origin: move(origin), apex: move(apex), base: move(base), open },
    disc: t.kind === 'syllabic' ? { c: middle, r: (HEIGHT / 2) * unit * FULL_SCALE } : undefined,
  };
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const length2 = ab.x * ab.x + ab.y * ab.y;
  const k = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / length2));
  return distance(p, add(a, scale(ab, k)));
}

/** The first rule an arrangement breaks, if any. Expects normalised tiles. */
export function check(tiles: readonly Tile[], tokens: readonly Token[], unit = 1): Violation | undefined {
  const label = (t: Tile) => `“${name(tokens[t.index])}”`;

  // taken
  const squares = new Map<string, Tile[]>();
  for (const t of tiles) {
    const key = `${t.col},${t.row}`;
    squares.set(key, [...(squares.get(key) ?? []), t]);
  }
  for (const members of squares.values()) {
    if (members.length < 2) continue;
    const full = members.find((m) => m.size === 'full');
    const slots = members.map((m) => slotOf(m, tokens));
    const twice = members.find((_, i) => slots.indexOf(slots[i]) !== i);
    const clash = full ?? twice;
    if (clash) {
      const other = members.find((m) => m !== clash)!;
      return {
        rule: 'taken',
        message: full
          ? `${label(full)} is full size and needs the square to itself.`
          : `${label(other)} already fills that quarter of the square.`,
        tiles: [clash.index, other.index],
      };
    }
  }

  // order, word by word
  const rank = (t: Tile) => {
    const slot = slotOf(t, tokens);
    return slot ? SLOT_ORDER.indexOf(slot) : 0;
  };
  for (let i = 1; i < tiles.length; i++) {
    const [a, b] = [tiles[i - 1], tiles[i]];
    if (a.word !== b.word) continue;
    const later = b.col !== a.col ? b.col > a.col : b.row !== a.row ? b.row > a.row : rank(b) > rank(a);
    if (!later) {
      return {
        rule: 'order',
        message: `That would change the reading: ${label(b)} would be read before ${label(a)}.`,
        tiles: [a.index, b.index],
      };
    }
  }

  // apart
  for (const word of new Set(tiles.map((t) => t.word))) {
    const mine = tiles.filter((t) => t.word === word);
    const reached = new Set([mine[0]]);
    const queue = [mine[0]];
    while (queue.length > 0) {
      const at = queue.pop()!;
      for (const t of mine) {
        if (!reached.has(t) && Math.abs(t.col - at.col) <= 1 && Math.abs(t.row - at.row) <= 1) {
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

  // trespass and closed need the drawn strokes
  const drawn = tiles.map((t) => draw(t, tokens, unit));
  const inside = (p: Point, d: Drawn, slack: number) => {
    if (d.disc) return distance(p, d.disc.c) < d.disc.r - slack * unit;
    const [s, t] = local(p, d.frame);
    return s > slack && t > slack && s + t < 1 - slack;
  };
  const outside = drawn.map((d) =>
    d.disc ? [] : d.strokes.flatMap((st) => samples(st, 8)).filter((p) => !inside(p, d, -0.03)),
  );
  /** Points along the outline of a glyph's triangle (or its circle). */
  const outline = drawn.map((d) => {
    if (d.disc) return samples({ kind: 'circle', c: d.disc.c, r: d.disc.r }, 16);
    const { origin, apex, base } = d.frame;
    return [[origin, apex], [apex, base], [base, origin]].flatMap(([p, q]) =>
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((k) => add(p, scale(sub(q, p), k))),
    );
  });
  /** True when a point is so close to a glyph's strokes that it could be taken for one of them. */
  const near = (p: Point, d: Drawn) =>
    d.strokes.some((st) => {
      if (st.kind === 'line') return distanceToSegment(p, st.a, st.b) < unit * 0.5;
      if (st.kind === 'arc') return samples(st, 8).some((q) => distance(p, q) < unit * 0.5);
      const gap = distance(p, st.c) - st.r;
      return st.kind === 'dot' ? gap < unit * 0.5 : Math.abs(gap) < unit * 0.5;
    });
  for (let a = 0; a < tiles.length; a++) {
    for (let b = 0; b < tiles.length; b++) {
      if (a === b || Math.abs(tiles[a].col - tiles[b].col) > 2 || Math.abs(tiles[a].row - tiles[b].row) > 2) continue;
      if (a < b && (outline[a].some((p) => inside(p, drawn[b], 0.04)) || outline[b].some((p) => inside(p, drawn[a], 0.04)))) {
        return {
          rule: 'taken',
          message: `${label(tiles[a])} and ${label(tiles[b])} would overlap.`,
          tiles: [tiles[a].index, tiles[b].index],
        };
      }
      if (outside[a].some((p) => inside(p, drawn[b], 0.03))) {
        return {
          rule: 'trespass',
          message: `The marks of ${label(tiles[a])} would land inside ${label(tiles[b])} and be read as part of it.`,
          tiles: [tiles[a].index, tiles[b].index],
        };
      }
      if (outside[a].some((p) => near(p, drawn[b]))) {
        return {
          rule: 'trespass',
          message: `The marks of ${label(tiles[a])} would sit so close to ${label(tiles[b])} that they could be read as part of it.`,
          tiles: [tiles[a].index, tiles[b].index],
        };
      }
    }
  }
  for (let b = 0; b < tiles.length; b++) {
    const { frame } = drawn[b];
    if (!frame.open) continue;
    const along = [0.2, 0.35, 0.5, 0.65, 0.8].map((k) => add(frame.origin, scale(sub(frame.base, frame.origin), k)));
    for (let a = 0; a < tiles.length; a++) {
      if (a === b) continue;
      const lines = drawn[a].strokes.filter((st) => st.kind === 'line');
      const covered = along.filter((p) =>
        lines.some((st) => st.kind === 'line' && distanceToSegment(p, st.a, st.b) < unit / 4),
      );
      if (covered.length >= 4) {
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

export interface Target {
  col: number;
  row: number;
  /** True when the glyph is given a new column here, pushing later glyphs along. */
  insert: boolean;
  /** The arrangement this move gives, tidied. */
  tiles: Tile[];
  violation?: Violation;
}

const signature = (tiles: readonly Tile[]) => tiles.map((t) => `${t.col},${t.row},${t.size}`).join(' ');

/**
 * Every place one glyph could be moved to: each half square across its word
 * and one square beyond, one row beyond the board in each direction, and a
 * new column at each place a glyph of the word starts. Each comes with the
 * arrangement it would give and the rule it would break, if any.
 */
export function targets(tiles: readonly Tile[], tokens: readonly Token[], index: number, unit = 1): Target[] {
  const tile = tiles.find((t) => t.index === index);
  if (!tile) return [];
  const cols = tiles.filter((t) => t.word === tile.word).map((t) => t.col);
  const [first, last] = [Math.min(...cols), Math.max(...cols)];
  const rows = tiles.map((t) => t.row);
  const [top, bottom] = [Math.min(...rows) - 1, Math.max(...rows) + 1];
  const seen = new Set([signature(tiles)]);
  const out: Target[] = [];
  const offer = (col: number, row: number, insert: boolean) => {
    const moved = normalise(
      tiles.map((t) => {
        if (t.index === index) return { ...t, col, row };
        return insert && t.word === tile.word && t.col >= col ? { ...t, col: t.col + 1 } : t;
      }),
    );
    const key = signature(moved);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ col, row, insert, tiles: moved, violation: check(moved, tokens, unit) });
  };
  for (let col = first - 1; col <= last + 1; col += 0.5) {
    for (let row = top; row <= bottom; row++) offer(col, row, false);
  }
  for (const col of new Set([...cols, last + 1])) {
    for (let row = top; row <= bottom; row++) offer(col, row, true);
  }
  return out;
}

export interface BoardLayout extends Layout {
  /** The column and row of the square at the top left of the view. */
  origin: { col: number; row: number };
  cols: number;
  rows: number;
}

/** The board as a Layout, so that the SVG and colour code can draw it. `margin` is in squares. */
export function boardLayout(
  tiles: readonly Tile[],
  tokens: readonly Token[],
  unit: number,
  margin: number,
): BoardLayout {
  const s = side(unit);
  const colsUsed = tiles.map((t) => t.col);
  const rowsUsed = tiles.map((t) => t.row);
  const origin = { col: Math.min(...colsUsed) - margin, row: Math.min(...rowsUsed) - margin };
  const cols = Math.max(...colsUsed) - Math.min(...colsUsed) + 1 + margin * 2;
  const rows = Math.max(...rowsUsed) - Math.min(...rowsUsed) + 1 + margin * 2;
  const shift = (p: Point) => pt(p.x - origin.col * s, p.y - origin.row * s);
  const glyphs: Placed[] = tiles.map((tile) => {
    const { strokes, frame } = draw(tile, tokens, unit);
    return {
      index: tile.index,
      at: shift(pt(tile.col * s, tile.row * s)),
      advance: s,
      strokes: strokes.map(
        (st): Stroke => (st.kind === 'line' ? { ...st, a: shift(st.a), b: shift(st.b) } : { ...st, c: shift(st.c) }),
      ),
      frame: { origin: shift(frame.origin), apex: shift(frame.apex), base: shift(frame.base), open: frame.open },
    };
  });
  return { glyphs, width: cols * s, height: rows * s, origin, cols, rows };
}
