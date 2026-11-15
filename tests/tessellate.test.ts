import { describe, expect, it } from 'vitest';
import { BASE } from '../src/core/geometry';
import { buildSyllable } from '../src/core/glyph';
import { staysInside, tessellate } from '../src/core/tessellate';
import { layout, type Token } from '../src/core/text';
import { transcribeZulu } from '../src/input/zulu';

const cells = (text: string) => {
  const { tokens } = transcribeZulu(text);
  const lay = tessellate(tokens, 3);
  const out: string[][] = [];
  for (const g of lay.glyphs) (out[g.cell!] ??= []).push(tokens[g.index].kind === 'syllable' ? (tokens[g.index] as any).source : 'm');
  return out;
};

describe('tessellated layout', () => {
  it('shares a square between syllables whose quarters follow in reading order', () => {
    // o (left) then a (top) then i (bottom) then e (right)
    expect(cells('khotasike')).toEqual([['kho', 'ta', 'si', 'ke']]);
    // i (bottom) cannot be followed by e's neighbour o (left) in the same square
    expect(cells('sitho')).toEqual([['si'], ['tho']]);
    expect(cells('kasi')).toEqual([['ka', 'si']]);
  });

  it('gives a square to any glyph with marks outside its triangle', () => {
    expect(staysInside(buildSyllable('a', ['t', '•'], 3))).toBe(true);
    expect(staysInside(buildSyllable('a', ['°'], 3))).toBe(false);
    expect(staysInside(buildSyllable('i', ['l'], 3))).toBe(false);
    expect(cells('thoma')).toEqual([['tho'], ['ma']]);
    expect(cells('umthi')).toEqual([['u'], ['m'], ['thi']]);
  });

  it('starts every word in a new square and keeps every glyph', () => {
    const { tokens } = transcribeZulu('ditema tsa dinoko');
    const lay = tessellate(tokens, 3);
    expect(lay.glyphs.length).toBe(layout(tokens, 3).glyphs.length);
    expect(cells('tha thi')).toEqual([['tha'], ['thi']]);
  });

  it('makes the four apexes of a full square meet in its middle', () => {
    const { tokens } = transcribeZulu('khotasike');
    const lay = tessellate(tokens, 3);
    const [first] = lay.glyphs;
    expect(first.frame.apex.x).toBeCloseTo((BASE * 3) / 2);
    for (const g of lay.glyphs) {
      expect(g.frame.apex.x).toBeCloseTo(first.frame.apex.x);
      expect(g.frame.apex.y).toBeCloseTo(first.frame.apex.y);
    }
  });

  it('keeps strokes inside the square and free of NaN', () => {
    const tokens: Token[] = transcribeZulu('khotasike zosatshi').tokens;
    for (const g of tessellate(tokens, 3).glyphs) {
      for (const s of g.strokes) {
        const points = s.kind === 'line' ? [s.a, s.b] : [s.c];
        for (const p of points) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
          expect(p.x).toBeGreaterThanOrEqual(g.at.x - 0.5);
          expect(p.x).toBeLessThanOrEqual(g.at.x + g.advance + 0.5);
        }
      }
    }
  });

  it('draws a word with no shapes exactly as the ordinary line does', () => {
    const { tokens } = transcribeZulu('sanibonani hamba kahle');
    const plain = layout(tokens, 3);
    const lay = tessellate(tokens, 3);
    expect(lay.glyphs.map((g) => g.strokes)).toEqual(plain.glyphs.map((g) => g.strokes));
    expect(lay.width).toBeCloseTo(plain.width);
  });

  it('stacks an i syllable on the a syllable that follows it', () => {
    expect(cells('sika')).toEqual([['si', 'ka']]);
    expect(cells('nina')).toEqual([['ni', 'na']]);
    // nasals and the p bar sit on the apexes, away from the join
    expect(cells('imbiba')).toEqual([['i'], ['mbi', 'ba']]);
    const [upper, lower] = tessellate(transcribeZulu('sika').tokens, 3).glyphs;
    expect(upper.frame.origin.y).toBeCloseTo(lower.frame.origin.y);
    expect(upper.frame.apex.y).toBeLessThan(lower.frame.apex.y);
    expect(lower.frame.apex.y - upper.frame.apex.y).toBeCloseTo(BASE * 3);
  });

  it('keeps out of a diamond anything that would be misread there', () => {
    // u's open base would be closed by the a below, and read as i
    expect(cells('suka')).toEqual([['su'], ['ka']]);
    // the y mark lies beyond the base, inside the other half
    expect(cells('siya')).toEqual([['si'], ['ya']]);
    // a square already being filled comes first
    expect(cells('tasika')).toEqual([['ta', 'si'], ['ka']]);
  });

  it('wraps whole words', () => {
    const { tokens } = transcribeZulu('sika sika sika');
    const wide = tessellate(tokens, 3);
    const narrow = tessellate(tokens, 3, wide.width - 1);
    expect(narrow.height).toBeGreaterThan(wide.height);
  });
});
