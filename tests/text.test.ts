import { describe, expect, it } from 'vitest';
import { renderSvg, strokePaths } from '../src/core/svg';
import { deserialize, layout, lineHeight, serialize, type Token } from '../src/core/text';
import { makeTranscriber } from '../src/input/nguni';
import { XHOSA_WORDS } from '../src/input/words/xhosa';
import { ZULU_WORDS } from '../src/input/words/zulu';
import { XHOSA_ONSETS, transcribeXhosa } from '../src/input/xhosa';
import { ZULU_ONSETS, transcribeZulu } from '../src/input/zulu';

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

describe('isiXhosa transcription', () => {
  const xh = (text: string) =>
    transcribeXhosa(text).tokens.map((t) =>
      t.kind === 'syllable' ? t.consonants.join('') + t.vowel : t.kind === 'syllabic' ? t.letter : ' ',
    );

  it('reads what isiXhosa shares with isiZulu the same way', () => {
    for (const text of ['molo', 'amanzi', 'umntwana', 'iqhawe', 'pha pa bha ba', 'ingwe']) {
      expect(transcribeXhosa(text)).toEqual(transcribeZulu(text));
    }
  });

  it('reads the palatal stops', () => {
    expect(xh('tyha tya dya')).toEqual(['ca', ' ', 'c•a', ' ', 'c-a']);
    expect(xh('ukutya')).toEqual(['u', 'k•u', 'c•a']);
    expect(xh('intyatyambo')).toEqual(['i', '°c•a', 'c•a', '°p-•ɔ']);
    expect(xh('indyebo')).toEqual(['i', '°c-•ɛ', 'p-•ɔ']);
  });

  it('reads rh, gr and kr', () => {
    expect(xh('irhafu')).toEqual(['i', 'xa', 'fu']);
    expect(xh('igrogro')).toEqual(['i', 'x-ɔ', 'x-ɔ']);
    expect(xh('ukukrazula')).toEqual(['u', 'k•u', 'kx•a', 's-u', 'la']);
    expect(xh('irayisi')).toEqual(['i', 'ra', 'ji', 'si']);
  });

  it('tells the aspirated affricates from the ejective ones', () => {
    expect(xh('thsa tsa dza')).toEqual(['tsa', ' ', 'ts•a', ' ', 'ts-a']);
    expect(xh('thsha tsha ja')).toEqual(['ʃta', ' ', 'ʃt•a', ' ', 'ʃt-a']);
  });

  it("reads ng' as the velar nasal and keeps its spelling in the reading", () => {
    const { tokens, unread } = transcribeXhosa("ing'ang'ane ingoma");
    expect(xh("ing'ang'ane ingoma")).toEqual(['i', 'ŋa', 'ŋa', 'nɛ', ' ', 'i', '°k-•ɔ', '°a']);
    expect(tokens[1]).toMatchObject({ source: "ng'a" });
    expect(unread).toEqual([]);
  });

  it('reads tl and the breathy nasals (both by analogy)', () => {
    expect(xh('intloko')).toEqual(['i', '°tɬ•ɔ', 'k•ɔ']);
    expect(xh('nyhani')).toEqual(['ɲ-a', 'ni']);
    expect(xh('umhambi')).toEqual(['u', 'm̩', 'ha', '°p-•i']);
  });

  it('writes the name of the language', () => {
    expect(xh('isiXhosa')).toEqual(['i', 'si', '||ɔ', 'sa']);
  });
});

describe('sample word lists', () => {
  it('reads a listed word as the list divides it', () => {
    // umfula takes the prefix um-, so its m stays a syllable in the locative.
    expect(read('emfuleni')).toEqual(['ɛ', 'm̩', 'fu', 'lɛ', 'ni']);
    expect(read('siyambonga')).toEqual(['si', 'ja', 'm̩', 'p-•ɔ', '°k-•a']);
    expect(transcribeZulu('Emfuleni').listed).toEqual(['e-m-fu-le-ni']);
  });

  it('still reads every other word by rule', () => {
    // imfundo has a prenasalised mf, and so does its locative.
    expect(read('emfundweni')).toEqual(['ɛ', '°fu', '°t-•wɛ', 'ni']);
    expect(read('siyabonga')).toEqual(['si', 'ja', 'p-•ɔ', '°k-•a']);
    expect(transcribeZulu('siyabonga emfundweni').listed).toEqual([]);
  });

  it('keeps one consonant whole where the rule would split it', () => {
    expect(read('umpetha')).toEqual(['u', '°p•ɛ', 'ta']);
    expect(read('umfana')).toEqual(['u', 'm̩', 'fa', 'na']);
  });

  const lists = [
    ['isiZulu', ZULU_WORDS, ZULU_ONSETS, transcribeZulu],
    ['isiXhosa', XHOSA_WORDS, XHOSA_ONSETS, transcribeXhosa],
  ] as const;

  it.each(lists)('%s entries spell their word, read cleanly and differ from the rule', (_, words, onsets, withList) => {
    const byRule = makeTranscriber({ onsets });
    const sources = (tokens: Token[]) => tokens.map((t) => ('source' in t ? t.source : '')).join('-');
    for (const [word, division] of Object.entries(words)) {
      expect(division.replaceAll('-', ''), word).toBe(word);
      const listed = withList(word);
      expect(listed.unread, word).toEqual([]);
      expect(sources(listed.tokens), word).toBe(division);
      // An entry the rule already reads the same way does not belong in the list.
      expect(sources(byRule(word).tokens), word).not.toBe(division);
    }
  });
});
