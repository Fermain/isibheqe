/**
 * Proof that the designed forms are unchanged: run the 2015 glyph code in a
 * sandbox and compare its drawing instructions with the port, stroke by stroke.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { Stroke } from '../src/core/geometry';
import {
  CONSONANTS,
  SYLLABIC_CONSONANTS,
  VOWELS,
  buildSyllabicConsonant,
  buildSyllable,
  type Consonant,
} from '../src/core/glyph';

const legacySource = readFileSync(
  fileURLToPath(new URL('../legacy/lib/isibheqe-glyphs.js', import.meta.url)),
  'utf8',
);
const sandbox = vm.createContext({ Math, console });
vm.runInContext(legacySource, sandbox);

const UNIT = 3;
type Numbers = number[];

function legacy(expr: string): { data: Numbers[]; advance: number } {
  const raw = vm.runInContext(
    `(function () {
       var g = ${expr};
       var data = g.data.map(function (d) {
         return d.length === 2 ? [d[0].x, d[0].y, d[1].x, d[1].y] : d.slice();
       });
       return JSON.stringify({ data: data, advance: g.kerning() });
     })()`,
    sandbox,
  ) as string;
  return JSON.parse(raw);
}

const TAU = Math.PI * 2;
function flatten(strokes: Stroke[]): Numbers[] {
  return strokes.map((s) => {
    switch (s.kind) {
      case 'line':
        return [s.a.x, s.a.y, s.b.x, s.b.y];
      case 'arc':
        return [s.c.x, s.c.y, s.r, s.start, s.end];
      case 'circle':
        return [s.c.x, s.c.y, s.r, 0, TAU];
      case 'dot':
        return [s.c.x, s.c.y, s.r];
    }
  });
}

function expectSame(ours: { strokes: Stroke[]; advance: number }, theirs: ReturnType<typeof legacy>, label: string) {
  const flat = flatten(ours.strokes);
  expect(flat.length, `${label}: stroke count`).toBe(theirs.data.length);
  flat.forEach((stroke, i) => {
    expect(stroke.length, `${label}: stroke ${i} kind`).toBe(theirs.data[i].length);
    stroke.forEach((value, j) => {
      expect(Math.abs(value - theirs.data[i][j]), `${label}: stroke ${i}[${j}]`).toBeLessThan(1e-9);
    });
  });
  expect(Math.abs(ours.advance - theirs.advance), `${label}: advance`).toBeLessThan(1e-9);
}

const legacySyllable = (vowel: string, consonants: readonly string[]) =>
  legacy(
    `(function () {
       var g = new GlyphFactory(${UNIT}).newVowel(${JSON.stringify(vowel)}, new Point(0, 0));
       ${JSON.stringify(consonants)}.forEach(function (c) { g.addConsonant(c); });
       return g;
     })()`,
  );

/** The one deliberate difference: see the "~" case in glyph.ts. */
const fixedBySpec = (cs: readonly Consonant[]) =>
  cs.includes('~') &&
  (cs.includes('ɲ') || cs.includes('ŋ')) &&
  !cs.includes('n') &&
  !cs.includes('n̪' as Consonant) &&
  !cs.includes('°');

describe('parity with the 2015 implementation', () => {
  it('uses the same symbol inventory', () => {
    expect([...VOWELS]).toEqual(vm.runInContext('VOWELS', sandbox));
    expect([...CONSONANTS]).toEqual(vm.runInContext('CONSONANTS', sandbox));
    expect([...SYLLABIC_CONSONANTS]).toEqual(vm.runInContext('SYLLABIC_CONSONANTS', sandbox));
  });

  it('draws every bare vowel identically', () => {
    for (const v of VOWELS) expectSame(buildSyllable(v, [], UNIT), legacySyllable(v, []), v);
  });

  it('draws every vowel + consonant identically', () => {
    for (const v of VOWELS) {
      for (const c of CONSONANTS) {
        expectSame(buildSyllable(v, [c], UNIT), legacySyllable(v, [c]), `${c}${v}`);
      }
    }
  });

  it('draws every vowel + consonant pair identically, in both orders', () => {
    let compared = 0;
    for (const v of VOWELS) {
      for (const a of CONSONANTS) {
        for (const b of CONSONANTS) {
          if (a === b || fixedBySpec([a, b])) continue;
          expectSame(buildSyllable(v, [a, b], UNIT), legacySyllable(v, [a, b]), `${a}+${b}+${v}`);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(6000);
  });

  it('draws common three-mark syllables identically', () => {
    const triples: Consonant[][] = [
      ['p', '-', '•'],
      ['°', 'k', '-'],
      ['ʃ', 't', '-'],
      ['ȿ', 't', '-'],
      ['k', '-', '•'],
      ['|', '-', '•'],
      ['°', '~', 'p'],
      ['l', 'l̩' as Consonant, 'w'],
      ['r', 'r̩' as Consonant, '•'],
      ['t', 's', '•'],
      ['°', 'f', '-'],
    ];
    for (const v of VOWELS) {
      for (const t of triples) expectSame(buildSyllable(v, t, UNIT), legacySyllable(v, t), t.join('+') + v);
    }
  });

  it('draws the syllabic nasals identically', () => {
    for (const s of SYLLABIC_CONSONANTS) {
      const theirs = legacy(
        `new GlyphFactory(${UNIT}).newSyllabicConsonant(${JSON.stringify(s)}, new Point(0, 0))`,
      );
      expectSame(buildSyllabicConsonant(s, UNIT), theirs, s);
    }
  });

  it('places glyphs at an offset exactly as the original did', () => {
    const theirs = legacy(
      `(function () {
         var g = new GlyphFactory(${UNIT}).newVowel("e", new Point(120, 80));
         g.addConsonant("f"); g.addConsonant("j");
         return g;
       })()`,
    );
    expectSame(buildSyllable('e', ['f', 'j'], UNIT, { x: 120, y: 80 }), theirs, 'offset');
  });
});

describe('the one correction, from the specification', () => {
  it('moves the nasal-vowel dot to the base when ɲ or ŋ holds the apex', () => {
    for (const nasal of ['ɲ', 'ŋ'] as Consonant[]) {
      const withN = buildSyllable('i', ['n', '~'], UNIT).strokes.at(-1);
      const fixed = buildSyllable('i', [nasal, '~'], UNIT).strokes.at(-1);
      expect(fixed).toEqual(withN);
    }
  });
});
