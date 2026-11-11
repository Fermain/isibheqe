import { describe, expect, it } from 'vitest';
import { renderSvg, strokePaths } from '../src/core/svg';
import { deserialize, layout, lineHeight, serialize, type Token } from '../src/core/text';
import { transcribeZulu } from '../src/input/zulu';

const read = (text: string) =>
  transcribeZulu(text).tokens.map((t) =>
    t.kind === 'syllable'
      ? t.consonants.join('') + t.vowel
      : t.kind === 'syllabic'
        ? t.letter
        : t.kind === 'space'
          ? ' '
          : '\n',
  );

describe('isiZulu transcription', () => {
  it('reads the sample line from the isiBheqe explanation sheet', () => {
    // "u ɬɛ lɔ  lɔ k̬u lɔ ɓa  a ma zwi" on isibheqe.org.za's ingcazo.pdf
    expect(read('uhlelo lokuloba amazwi')).toEqual([
      'u', 'ɬɛ', 'lɔ', ' ', 'lɔ', 'k•u', 'lɔ', 'p-•a', ' ', 'a', '°a', 's-wi',
    ]);
  });

  it('distinguishes aspirated, plain and voiced stops', () => {
    expect(read('pha pa bha ba')).toEqual(['pa', ' ', 'p•a', ' ', 'p-a', ' ', 'p-•a']);
    expect(read('thi ti di')).toEqual(['ti', ' ', 't•i', ' ', 't-i']);
  });

  it('reads clicks and nasal clicks', () => {
    expect(read('cha ca gca nca ngca')).toEqual(['|a', ' ', '|•a', ' ', '|-a', ' ', '°|a', ' ', '°|-a']);
    expect(read('iqhawe')).toEqual(['i', '!a', 'wɛ']);
    expect(read('ixoxo')).toEqual(['i', '||•ɔ', '||•ɔ']);
  });

  it('reads prenasalised and labialised onsets', () => {
    expect(read('amanzi')).toEqual(['a', '°a', '°s-i']);
    expect(read('imvula')).toEqual(['i', '°f-u', 'la']);
    expect(read('ingwe')).toEqual(['i', '°k-•wɛ']);
    expect(read('inyoni')).toEqual(['i', 'ɲɔ', 'ni']);
  });

  it('follows the 2016 booklet for the mp / mb series', () => {
    expect(read('mpha mpa mbha mba')).toEqual(['°pa', ' ', '°p•a', ' ', '°p-a', ' ', '°p-•a']);
    expect(read('nza')).toEqual(['°s-a']);
  });

  it('finds the syllabic m of the um- prefix', () => {
    expect(read('umfana')).toEqual(['m̩'.normalize('NFD'), 'fa', 'na'].toSpliced(0, 0, 'u'));
    expect(read('umntwana')).toEqual(['u', 'm̩', '°t•wa', 'na']);
    expect(read('umdabuko')).toEqual(['u', 'm̩', 't-a', 'p-•u', 'k•ɔ']);
    expect(read('umama')).toEqual(['u', '°a', '°a']);
  });

  it('keeps line breaks, drops punctuation, ignores elision marks', () => {
    expect(read('Sawubona!\nYebo.')).toEqual(['sa', 'wu', 'p-•ɔ', 'na', '\n', 'jɛ', 'p-•ɔ']);
    expect(read("ngob'ukuthi")).toEqual(['°k-•ɔ', 'p-•u', 'k•u', 'ti']);
  });

  it('reports what it cannot read instead of guessing', () => {
    const { unread } = transcribeZulu('strato');
    expect(unread).toEqual(['str']);
  });
});

describe('document format', () => {
  it('round-trips through the 2015 JSON format', () => {
    const json = '["u",["a",["p","-"]]," ","m̩","\\n",["ɛ",["ɬ"]]]';
    const tokens = deserialize(json);
    expect(tokens.map((t) => t.kind)).toEqual(['syllable', 'syllable', 'space', 'syllabic', 'newline', 'syllable']);
    expect(deserialize(serialize(tokens))).toEqual(tokens);
  });

  it('rejects unknown symbols with a readable message', () => {
    expect(() => deserialize('["q"]')).toThrow(/Unknown vowel "q"/);
    expect(() => deserialize('[["a",["zz"]]]')).toThrow(/Unknown consonant "zz"/);
    expect(() => deserialize('{}')).toThrow(/list/);
  });
});

describe('layout and SVG', () => {
  const tokens: Token[] = transcribeZulu('sawubona mhlaba').tokens;

  it('wraps whole words', () => {
    const wide = layout(tokens, 3);
    const narrow = layout(tokens, 3, wide.width - 1);
    expect(narrow.height - wide.height).toBeCloseTo(lineHeight(3));
    expect(narrow.glyphs.length).toBe(wide.glyphs.length);
  });

  it('draws canvas-style arcs as the short anticlockwise sweep', () => {
    const { outline } = strokePaths([
      { kind: 'arc', c: { x: 0, y: 0 }, r: 10, start: Math.PI / 4, end: -Math.PI / 4 },
    ]);
    expect(outline).toBe('M7.07 7.07A10 10 0 0 0 7.07 -7.07');
  });

  it('produces a standalone, titled SVG', () => {
    const svg = renderSvg(layout(tokens, 3), { unit: 3, title: 'sawubona <mhlaba>' });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain('<title>sawubona &lt;mhlaba&gt;</title>');
    expect(svg).not.toContain('NaN');
  });
});

describe('marks and frames', () => {
  it('tags every stroke with the mark it belongs to', () => {
    const [glyph] = layout(transcribeZulu('ba').tokens, 3).glyphs;
    expect(new Set(glyph.strokes.map((s) => s.by))).toEqual(new Set(['a', 'p', '-', '•']));
    const svg = renderSvg(layout(transcribeZulu('ba').tokens, 3), { unit: 3 });
    expect(svg).toContain('data-by="p"');
  });

  it('knows which vowels leave the base open', () => {
    const [u, i] = layout(transcribeZulu('u i').tokens, 3).glyphs;
    expect(u.frame.open).toBe(true);
    expect(i.frame.open).toBe(false);
  });

  it('prints a reading under each glyph when asked', () => {
    const tokens = transcribeZulu('hle').tokens;
    const plain = layout(tokens, 3);
    const glossed = layout(tokens, 3, Infinity, true);
    expect(glossed.height).toBeGreaterThan(plain.height);
    expect(renderSvg(glossed, { unit: 3, labels: () => 'hle' })).toContain('>hle</text>');
  });
});
