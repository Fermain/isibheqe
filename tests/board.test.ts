import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { check, corners, draw, lineUp, normalise, settle, targets, type Tile } from '../src/core/board';
import { HEIGHT } from '../src/core/geometry';
import { transcribeZulu } from '../src/input/zulu';

const board = (text: string) => {
  const { tokens } = transcribeZulu(text);
  return { tokens, tiles: lineUp(tokens) };
};
const at = (tiles: Tile[]) => tiles.map((t) => [t.k, t.row]);
/** Move glyph number n (counting glyphs, not tokens) and tidy. */
const put = (tiles: Tile[], n: number, change: Partial<Tile>) =>
  normalise(tiles.map((t, i) => (i === n ? { ...t, ...change } : t)));
const share = (a: [number, number][], b: [number, number][]) =>
  a.some(([k, l]) => b.some(([k2, l2]) => k === k2 && l === l2));

describe('the arranging board', () => {
  it('starts every text as a legal arrangement', () => {
    const src = readFileSync('src/pages/check-sheet.ts', 'utf8');
    for (const [, words] of src.matchAll(/\['([^']+)', ["']/g)) {
      const b = board(words);
      expect(b.tiles.length, words).toBeGreaterThan(0);
      expect(check(b.tiles, b.tokens), words).toBeUndefined();
    }
  });

  it('nestles triangles that point up and down, at their designed size', () => {
    const { tokens, tiles } = board('kasawu');
    // "sa" points down, "wu" up: one step apart, sharing a side
    expect(tiles[2].k - tiles[1].k).toBe(1);
    const [sa, wu] = tiles.slice(1).map((t) => draw(t, tokens, 1).frame);
    expect(sa.origin.x - sa.base.x).toBeCloseTo(16);
    expect(sa.apex.y - sa.base.y).toBeCloseTo(HEIGHT);
    expect([sa.apex.x, sa.apex.y]).toEqual([wu.origin.x, wu.origin.y]);
    expect([sa.origin.x, sa.origin.y]).toEqual([wu.apex.x, wu.apex.y]);
  });

  it('only lets an upright glyph into a triangle that points its way', () => {
    const { tokens, tiles } = board('kasasa');
    expect(check(tiles.map((t, i) => (i === 2 ? { ...t, k: t.k + 1 } : t)), tokens)?.rule).toBe('lattice');
    expect(targets(tiles, tokens, tiles[2].index).every((t) => Math.abs(t.k + t.row) % 2 === 1)).toBe(true);
  });

  it('sets a leading vowel a row above the root, touching it', () => {
    for (const word of ['ubaba', 'unjani', 'amanzi']) {
      const { tokens, tiles } = board(word);
      expect(tiles[1].row - tiles[0].row, word).toBe(1);
      expect(share(corners(tiles[0], tokens), corners(tiles[1], tokens)), word).toBe(true);
      // the root itself runs level
      expect(tiles[2].row, word).toBe(tiles[1].row);
    }
  });

  it('steps a word of two glyphs down from the first to the second', () => {
    const { tokens, tiles } = board('sala kahle');
    expect(at(tiles.slice(0, 2))).toEqual([[1, 0], [2, 1]]);
    expect(share(corners(tiles[0], tokens), corners(tiles[1], tokens))).toBe(true);
    expect(tiles[3].row - tiles[2].row).toBe(1);
  });

  it('keeps the glyphs of a longer word level and touching where it can', () => {
    const { tokens, tiles } = board('ngiyaphila');
    expect([tiles[1].k - tiles[0].k, tiles[1].row - tiles[0].row]).toEqual([1, 0]);
    for (let i = 1; i < tiles.length; i++) {
      expect(share(corners(tiles[i - 1], tokens), corners(tiles[i], tokens)), String(i)).toBe(true);
    }
  });

  it('seats sideways glyphs on a line, between two points of the lattice', () => {
    const { tokens, tiles } = board('bo');
    const { origin, base, apex } = draw(tiles[0], tokens, 1).frame;
    // the base stands across the line, its middle on a point; the apex is on the next point, a base away
    expect((origin.y + base.y) / 2).toBeCloseTo(apex.y);
    expect(apex.x - origin.x).toBeCloseTo(16);
    expect(base.y - origin.y).toBeCloseTo(16);
    expect((tiles[0].k + tiles[0].row) % 2).toBe(1);
    const large = draw({ ...tiles[0], large: true }, tokens, 1).frame;
    expect(large.base.y - large.origin.y).toBeCloseTo(2 * HEIGHT);
    expect(large.apex.x - large.origin.x).toBeCloseTo(24);
    expect(check([{ ...tiles[0], large: true }], tokens)).toBeUndefined();
  });

  it('seats a syllabic nasal on a line, as a circle through two points', () => {
    const { tokens, tiles } = board('umhlaba');
    const m = draw(tiles[1], tokens, 1).disc!;
    expect(m.r).toBeCloseTo(8);
    expect(m.c.y).toBeCloseTo(tiles[1].row * HEIGHT);
    expect(share(corners(tiles[0], tokens), corners(tiles[1], tokens))).toBe(true);
    expect(share(corners(tiles[1], tokens), corners(tiles[2], tokens))).toBe(true);
  });

  it('stacks an i on an a, base to base, and an a on an i, point to point', () => {
    const diamond = board('kasika');
    const stacked = put(diamond.tiles, 2, { k: diamond.tiles[1].k, row: diamond.tiles[1].row + 1 });
    expect(check(stacked, diamond.tokens)).toBeUndefined();
    const hourglass = board('sikasi');
    const pointed = put(hourglass.tiles, 2, { k: hourglass.tiles[1].k, row: hourglass.tiles[1].row + 1 });
    expect(check(pointed, hourglass.tokens)).toBeUndefined();
  });

  it('refuses an arrangement that would be read in another order', () => {
    const { tokens, tiles } = board('kasika');
    expect(check(put(tiles, 2, { k: tiles[1].k, row: tiles[1].row - 1 }), tokens)?.rule).toBe('order');
  });

  it('refuses a line that closes an open vowel', () => {
    const { tokens, tiles } = board('kasuka');
    expect(check(put(tiles, 2, { k: tiles[1].k, row: tiles[1].row + 1 }), tokens)?.rule).toBe('closed');
  });

  it('snaps a glyph beside a neighbour whose marks leave that triangle free', () => {
    // the circle of "ngi" sits on a point of the lattice; the triangle beside it is free
    const n = board('ngiyasa').tiles;
    expect([n[1].k - n[0].k, n[1].row - n[0].row]).toEqual([1, 0]);
    // the l line of "li" takes up the triangle on its left, so "sa" cannot nestle there
    const { tokens, tiles } = board('kasali');
    expect(tiles[2].k === tiles[1].k + 1 && tiles[2].row === tiles[1].row).toBe(false);
    expect(check(tiles.map((t, i) => (i === 2 ? { ...t, k: tiles[1].k + 1, row: tiles[1].row } : t)), tokens)?.rule).toBe('trespass');
    // the bar of "bi" would lie along the base of "sa" and vanish
    const bar = board('kasabi');
    expect(check(bar.tiles.map((t, i) => (i === 2 ? { ...t, k: bar.tiles[1].k + 1, row: bar.tiles[1].row } : t)), bar.tokens)?.rule).toBe('trespass');
  });

  it('refuses to send a glyph away from its word', () => {
    const { tokens, tiles } = board('sikatisa');
    expect(check(put(tiles, 3, { row: tiles[3].row + 4 }), tokens)?.rule).toBe('apart');
  });

  it('carries the rest of the word along when a glyph is moved, in formation', () => {
    const { tokens, tiles } = board('sasikasi');
    const down = targets(tiles, tokens, tiles[1].index).find((t) => !t.violation && t.row === tiles[1].row + 1)!;
    expect(down).toBeDefined();
    const dk = down.tiles[1].k - tiles[1].k;
    for (const i of [2, 3]) {
      expect(down.tiles[i].k - tiles[i].k).toBe(dk);
      expect(down.tiles[i].row - tiles[i].row).toBe(1);
    }
    expect(down.tiles[0]).toEqual(tiles[0]);
  });

  it('can move one glyph by itself', () => {
    const { tokens, tiles } = board('sasasasa');
    const alone = targets(tiles, tokens, tiles[3].index, 1, true).filter((t) => !t.violation);
    expect(alone.length).toBeGreaterThan(0);
    for (const t of alone) {
      expect(t.tiles[2].k - t.tiles[0].k).toBe(tiles[2].k - tiles[0].k);
      expect(t.tiles[2].row - t.tiles[0].row).toBe(tiles[2].row - tiles[0].row);
    }
  });

  it('offers only moves that keep the text, and always offers some', () => {
    const { tokens, tiles } = board('sawubona');
    for (const tile of tiles) {
      const legal = targets(tiles, tokens, tile.index, 1, tile === tiles[0]).filter((t) => !t.violation);
      expect(legal.length).toBeGreaterThan(0);
      for (const t of legal) expect(check(t.tiles, tokens)).toBeUndefined();
    }
  });

  it('keeps words a base apart and is left alone by tidying once tidy', () => {
    for (const text of ['sawubona mhlaba', 'umuntu ngumuntu ngabantu', 'sala kahle']) {
      const { tiles } = board(text);
      expect(settle(tiles)).toEqual(tiles);
      for (let i = 1; i < tiles.length; i++) {
        if (tiles[i].word !== tiles[i - 1].word) {
          const end = Math.max(...tiles.filter((t) => t.word === tiles[i - 1].word).map((t) => t.k + 2));
          expect(tiles[i].k - end).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
});
