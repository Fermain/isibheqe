/**
 * The reader shared by the Nguni languages: ordinary spelling in, isiBheqe
 * syllables out. Each language supplies its own table of consonant spellings;
 * the syllable rules (five vowels, open syllables, the syllabic m of the um-
 * prefix, labialisation with w) are common to isiZulu and isiXhosa.
 */
import type { Consonant, SyllabicConsonant, Vowel } from '../core/glyph';
import type { Token } from '../core/text';

const VOWEL_LETTERS: Record<string, Vowel> = { a: 'a', e: 'ɛ', i: 'i', o: 'ɔ', u: 'u' };

export type Onsets = Record<string, Consonant[]>;

export interface Orthography {
  /** Consonant spellings and the marks that write them. Longest match wins. */
  onsets: Onsets;
  /**
   * Spellings that use an apostrophe as part of a consonant (isiXhosa ng'),
   * each given a one-letter stand-in so the apostrophe is not taken for an
   * elision mark. Keyed by stand-in; the value is the spelling.
   */
  letters?: Record<string, string>;
}

const SYLLABIC_M = 'm̩' as SyllabicConsonant;
const SYLLABIC_N = 'n̩' as SyllabicConsonant;

function onsetMarks(ONSETS: Onsets, spelling: string): Consonant[] | undefined {
  const direct = ONSETS[spelling];
  if (direct) return direct;
  // Any onset can be labialised: kw, ngw, hlw …
  if (spelling.length > 1 && spelling.endsWith('w')) {
    const stem = ONSETS[spelling.slice(0, -1)];
    if (stem) return [...stem, 'w'];
  }
  return undefined;
}

export interface Transcription {
  tokens: Token[];
  /** Letter runs that could not be read, in order of appearance. */
  unread: string[];
}

function transcribeWord(
  word: string,
  out: Token[],
  unread: string[],
  { onsets, letters = {} }: Orthography,
): void {
  // Stand-in letters go back to their spelling in readings and warnings.
  const spell = (s: string) => s.replace(/./gu, (ch) => letters[ch] ?? ch);
  let i = 0;
  while (i < word.length) {
    const ch = word[i];
    if (ch in VOWEL_LETTERS) {
      out.push({ kind: 'syllable', vowel: VOWEL_LETTERS[ch], consonants: [], source: ch });
      i++;
      continue;
    }
    // Gather the consonant run up to the next vowel (or the end of the word).
    let end = i;
    while (end < word.length && !(word[end] in VOWEL_LETTERS) && word[end] !== "'") end++;
    let run = word.slice(i, end);
    const forcedSyllabic = word[end] === "'";
    const vowelLetter = forcedSyllabic ? undefined : word[end];

    // A syllabic m stands alone before another consonant: um-fa-na, um-ntwa-na.
    // "m" before b/p/f/v is otherwise a prenasalised consonant (i-mvu-la), so
    // there we only split after a word-initial "u", the noun-class prefix um-.
    const afterInitialU = i === 1 && word[0] === 'u';
    const splitsM =
      run.length > 1 &&
      run[0] === 'm' &&
      (!/[bpfv]/.test(run[1]) || afterInitialU || !vowelLetter);
    if (splitsM) {
      out.push({ kind: 'syllabic', letter: SYLLABIC_M, source: 'm' });
      run = run.slice(1);
      i++;
    }

    if (!vowelLetter) {
      // A consonant with no vowel after it: only the nasals can stand alone.
      if (run === 'm') out.push({ kind: 'syllabic', letter: SYLLABIC_M, source: run });
      else if (run === 'n') out.push({ kind: 'syllabic', letter: SYLLABIC_N, source: run });
      else if (run) unread.push(spell(run));
      i = end + (forcedSyllabic ? 1 : 0);
      continue;
    }

    const marks = onsetMarks(onsets, run);
    if (marks) {
      out.push({
        kind: 'syllable',
        vowel: VOWEL_LETTERS[vowelLetter],
        consonants: marks,
        source: spell(run) + vowelLetter,
      });
    } else {
      unread.push(spell(run));
      out.push({
        kind: 'syllable',
        vowel: VOWEL_LETTERS[vowelLetter],
        consonants: [],
        source: vowelLetter,
      });
    }
    i = end + 1;
  }
}

/**
 * Build a reader for one language. Punctuation is dropped (the script's
 * punctuation is not specified yet); line breaks are kept. m' or n' forces a
 * syllabic nasal.
 */
export function makeTranscriber(orthography: Orthography): (text: string) => Transcription {
  const standIns = Object.entries(orthography.letters ?? {});
  const extra = standIns.map(([letter]) => letter).join('');
  const separators = new RegExp(`[^a-z'${extra}]+`);
  return (text) => {
    const tokens: Token[] = [];
    const unread: string[] = [];
    const lines = text.toLowerCase().replace(/[’ʼ]/g, "'").split('\n');
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) tokens.push({ kind: 'newline' });
      for (const [letter, spelling] of standIns) {
        line = line.replaceAll(new RegExp(`${spelling}(?=[aeiou])`, 'g'), letter);
      }
      const words = line.split(separators).filter((w) => /[^']/.test(w));
      words.forEach((raw, wordIndex) => {
        if (wordIndex > 0) tokens.push({ kind: 'space' });
        // Keep the apostrophe only where it marks a lone m or n; elsewhere it is
        // an elision mark (ngob'ukuthi) and carries no sound.
        const word = raw.replace(/(?<!(?:^|[aeiou])[mn])'/g, '');
        transcribeWord(word, tokens, unread, orthography);
      });
    });
    return { tokens, unread };
  };
}
