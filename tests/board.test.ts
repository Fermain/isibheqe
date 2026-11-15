import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { check, draw, lineUp, normalise, settle, targets, type Tile } from '../src/core/board';
import { HEIGHT } from '../src/core/geometry';
import { transcribeZulu } from '../src/input/zulu';

const board = (text: string) => {
  const { tokens } = transcribeZulu(text);
  return { tokens, tiles: lineUp(tokens) };
};
/** Move glyph number n (counting glyphs, not tokens) and tidy. */
const put = (tiles: Tile[], n: number, change: Partial<Tile>) =>
  normalise(tiles.map((t, i) => (i === n ? { ...t, ...change } : t)));

describe('the arranging board', () => {
  it('starts every text as a legal line', () => {
    const src = readFileSync('src/pages/check-sheet.ts', 'utf8');
    for (const [, words] of src.matchAll(/\['([^']+)', ["']/g)) {
      const b = board(words);
      expect(b.tiles.length, words).toBeGreaterThan(0);
      expect(check(b.tiles, b.tokens), words).toBeUndefined();
      expect(b.tiles.every((t) => t.row === 0), words).toBe(true);
    }
  });

  it('nestles triangles that point up and down, by itself, at their designed size', () => {
    const { tokens, tiles } = board('sawu');
    // "sa" points down, "wu" up: one step apart, sharing a side
    expect(tiles.map((t) => t.k)).toEqual([1, 2]);
    const [sa, wu] = tiles.map((t) => draw(t, tokens, 1).frame);
    expect(sa.origin.x - sa.base.x).toBeCloseTo(16);
    expect(sa.apex.y - sa.base.y).toBeCloseTo(HEIGHT);
    // the right side of "sa" is the left side of "wu"
    expect([sa.apex.x, sa.apex.y]).toEqual([wu.origin.x, wu.origin.y]);
    expect([sa.origin.x, sa.origin.y]).toEqual([wu.apex.x, wu.apex.y]);
  });

  it('keeps two triangles that point the same way a whole base apart', () => {
    const { tiles } = board('sasa');
    expect(tiles[1].k - tiles[0].k).toBe(2);
  });

  it('only lets an upright glyph into a triangle that points its way', () => {
    const { tokens, tiles } = board('sasa');
    expect(check(tiles.map((t, i) => (i === 1 ? { ...t, k: t.k + 1 } : t)), tokens)?.rule).toBe('lattice');
    expect(targets(tiles, tokens, tiles[1].index).every((t) => (t.k + t.row) % 2 !== 0)).toBe(true);
  });

  it('stacks an i on an a, base to base, and an a on an i, point to point', () => {
    const diamond = board('sika');
    const stacked = put(diamond.tiles, 1, { k: diamond.tiles[0].k, row: 1 });
    expect(check(stacked, diamond.tokens)).toBeUndefined();
    const hourglass = board('kasi');
    const pointed = put(hourglass.tiles, 1, { k: hourglass.tiles[0].k, row: 1 });
    expect(check(pointed, hourglass.tokens)).toBeUndefined();
  });

  it('refuses an arrangement that would be read in another order', () => {
    const { tokens, tiles } = board('sika');
    expect(check(put(tiles, 1, { k: tiles[0].k, row: -1 }), tokens)?.rule).toBe('order');
  });

  it('refuses a line that closes an open vowel', () => {
    const { tokens, tiles } = board('suka');
    expect(check(put(tiles, 1, { k: tiles[0].k, row: 1 }), tokens)?.rule).toBe('closed');
  });

  it('refuses marks that would be read as a neighbour’s', () => {
    // the bar of "bi" lies along the top of the row, where the base of "sa" is
    const { tokens, tiles } = board('sabi');
    expect(tiles[1].k - tiles[0].k).toBeGreaterThan(1);
    expect(check(tiles.map((t, i) => (i === 1 ? { ...t, k: tiles[0].k + 1 } : t)), tokens)?.rule).toBe('trespass');
  });

  it('lets a glyph snap next to a neighbour whose marks do not take up that triangle', () => {
    // the circle of "ngi" sits on a point of the lattice; the triangle beside it is free
    const { tiles } = board('ngiya');
    expect(tiles.map((t) => t.k)).toEqual([0, 1]);
    // the l line of "li" takes up the triangle on its left, so "sa" cannot nestle there
    const l = board('sali');
    expect(l.tiles[1].k - l.tiles[0].k).toBeGreaterThan(1);
    expect(check(l.tiles.map((t, i) => (i === 1 ? { ...t, k: l.tiles[0].k + 1 } : t)), l.tokens)?.rule).toBe('trespass');
    // but on the other side of "li" the triangle is free
    expect(board('lisa').tiles.map((t) => t.k)).toEqual([0, 1]);
  });

  it('refuses to cut a glyph off from its word', () => {
    const { tokens, tiles } = board('sikati');
    expect(check(put(tiles, 2, { row: 4 }), tokens)?.rule).toBe('apart');
  });

  it('draws sideways glyphs small in the row, or large on the lattice', () => {
    const { tokens, tiles } = board('bo');
    const small = draw(tiles[0], tokens, 1).frame;
    expect(small.base.y - small.origin.y).toBeCloseTo(HEIGHT);
    const large = draw({ ...tiles[0], large: true }, tokens, 1).frame;
    expect(large.base.y - large.origin.y).toBeCloseTo(2 * HEIGHT);
    expect(large.apex.x - large.origin.x).toBeCloseTo(24);
    expect(check(normalise([{ ...tiles[0], large: true }]), tokens)).toBeUndefined();
  });

  it('closes the space a glyph leaves behind, and keeps words apart', () => {
    const { tokens, tiles } = board('sasasa sa');
    const spread = tiles.map((t, i) => (i >= 2 ? { ...t, k: t.k + 6 } : t));
    expect(settle(spread, tokens)).toEqual(tiles);
    expect(tiles[3].k - (tiles[2].k + 2)).toBeGreaterThanOrEqual(2);
  });

  it('offers only moves that keep the text, and always offers some', () => {
    const { tokens, tiles } = board('sawubona');
    for (const tile of tiles) {
      const legal = targets(tiles, tokens, tile.index).filter((t) => !t.violation);
      expect(legal.length).toBeGreaterThan(0);
      for (const t of legal) expect(check(t.tiles, tokens)).toBeUndefined();
    }
  });

  it('is left alone by tidying once it is tidy', () => {
    for (const text of ['sawubona mhlaba', 'umuntu ngumuntu ngabantu']) {
      const { tokens, tiles } = board(text);
      expect(settle(tiles, tokens)).toEqual(tiles);
    }
  });
});
