import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { check, lineUp, normalise, suggest, targets, type Tile } from '../src/core/board';
import { transcribeZulu } from '../src/input/zulu';

const board = (text: string) => {
  const { tokens } = transcribeZulu(text);
  return { tokens, tiles: lineUp(tokens) };
};
/** Move glyph number n (counting glyphs, not tokens) and tidy. */
const put = (tiles: Tile[], n: number, change: Partial<Tile>) =>
  normalise(tiles.map((t, i) => (i === n ? { ...t, ...change } : t)));

describe('the arranging board', () => {
  it('starts every text as a legal line, with a gap between words', () => {
    const { tokens, tiles } = board('hamba kahle');
    expect(tiles.map((t) => t.col)).toEqual([0, 1, 3, 4]);
    expect(check(tiles, tokens)).toBeUndefined();
    const src = readFileSync('src/pages/check-sheet.ts', 'utf8');
    for (const [, words] of src.matchAll(/\['([^']+)', ["']/g)) {
      const b = board(words);
      expect(check(b.tiles, b.tokens), words).toBeUndefined();
      expect(check(suggest(b.tokens), b.tokens), words).toBeUndefined();
    }
  });

  it('lets flat glyphs share a square, quarter by quarter', () => {
    const { tokens, tiles } = board('khotasike');
    const flat = tiles.map((t) => ({ ...t, size: 'flat' as const, col: 0 }));
    expect(check(normalise(flat), tokens)).toBeUndefined();
  });

  it('refuses a quarter that is taken, and company for a full glyph', () => {
    const { tokens, tiles } = board('sasa');
    const both = tiles.map((t) => ({ ...t, size: 'flat' as const, col: 0 }));
    expect(check(normalise(both), tokens)?.rule).toBe('taken');
    expect(check(put(tiles, 1, { col: 0 }), tokens)?.rule).toBe('taken');
  });

  it('refuses an arrangement that would be read in another order', () => {
    const { tokens, tiles } = board('sika');
    // ka above si in one column: ka would be read first
    expect(check(put(tiles, 1, { col: 0, row: -1 }), tokens)?.rule).toBe('order');
    // si above ka is fine
    expect(check(put(tiles, 1, { col: 0, row: 1 }), tokens)).toBeUndefined();
    // flat in one square: a (top) is read before i (bottom)
    const flat = tiles.map((t) => ({ ...t, size: 'flat' as const, col: 0 }));
    expect(check(normalise(flat), tokens)?.rule).toBe('order');
  });

  it('refuses marks that land inside a neighbour', () => {
    const { tokens, tiles } = board('nosi');
    // flat "no" has its circle in the middle of the square, at the tip of "si"
    const flat = tiles.map((t) => ({ ...t, size: 'flat' as const, col: 0 }));
    expect(check(normalise(flat), tokens)?.rule).toBe('trespass');
  });

  it('refuses a line that closes an open vowel', () => {
    const { tokens, tiles } = board('suka');
    const stacked = normalise([
      { ...tiles[0], size: 'flat' },
      { ...tiles[1], size: 'flat', col: 0, row: 1 },
    ]);
    expect(check(stacked, tokens)?.rule).toBe('closed');
    const { tokens: ok, tiles: okTiles } = board('sika');
    const diamond = normalise([
      { ...okTiles[0], size: 'flat' },
      { ...okTiles[1], size: 'flat', col: 0, row: 1 },
    ]);
    expect(check(diamond, ok)).toBeUndefined();
  });

  it('refuses to cut a glyph off from its word', () => {
    const { tokens, tiles } = board('sikati');
    expect(check(put(tiles, 2, { row: 2 }), tokens)?.rule).toBe('apart');
  });

  it('offers only moves that keep the text, and always offers some', () => {
    const { tokens, tiles } = board('sawubona');
    for (const tile of tiles) {
      const list = targets(tiles, tokens, tile.index);
      const legal = list.filter((t) => !t.violation);
      expect(legal.length).toBeGreaterThan(0);
      for (const t of legal) expect(check(t.tiles, tokens)).toBeUndefined();
    }
  });

  it('suggests shapes where the tessellation experiment found them', () => {
    const { tokens } = transcribeZulu('sawubona ikati');
    const tiles = suggest(tokens);
    expect(tiles.filter((t) => t.size === 'flat').length).toBe(4);
    expect(check(tiles, tokens)).toBeUndefined();
  });
});
