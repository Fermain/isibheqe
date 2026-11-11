/** Small helpers shared by every page. */
import './style.css';
import { isSyllabicConsonant, isVowel, type Consonant } from './core/glyph';
import { renderSvg } from './core/svg';
import { layout, type Token } from './core/text';
import { transcribeZulu } from './input/zulu';
import { beadBand, engravedBand } from './ornament';

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** How one token is spelled in Latin letters. */
export function spelled(t: Token): string {
  if (t.kind === 'space') return ' ';
  if (t.kind === 'newline') return '\n';
  if (t.source) return t.source;
  return t.kind === 'syllabic' ? t.letter : t.consonants.join('') + t.vowel;
}

export const reading = (list: readonly Token[]) => list.map(spelled).join('');

/** One glyph as a small inline SVG. */
export function glyphSvg(token: Token, unit = 2, guides = false): string {
  return renderSvg(layout([token], unit), { unit, guides });
}

/** A line of isiZulu drawn in the script, with the spelling under each glyph. */
export function zuluLine(text: string, unit = 3, maxWidth = Infinity): string {
  const { tokens } = transcribeZulu(text);
  return renderSvg(layout(tokens, unit, maxWidth, true), {
    unit,
    title: text,
    labels: (i) => spelled(tokens[i]),
  });
}

export function tokenFor(symbol: string, marks: Consonant[] = []): Token | undefined {
  if (isVowel(symbol)) return { kind: 'syllable', vowel: symbol, consonants: marks };
  if (isSyllabicConsonant(symbol)) return { kind: 'syllabic', letter: symbol };
  return undefined;
}

// The site's name, written in the script, heads every page.
const brand = document.getElementById('brand-glyphs');
if (brand) {
  brand.innerHTML = renderSvg(layout(transcribeZulu('isibheqe sohlamvu').tokens, 2), { unit: 2 });
}

// The two ornamental bands, one for each of the script's names.
for (const el of document.querySelectorAll('.band.beads')) el.innerHTML = beadBand();
for (const el of document.querySelectorAll('.band.engraved')) el.innerHTML = engravedBand();
