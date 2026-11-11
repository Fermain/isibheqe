/**
 * isiZulu spelling → isiBheqe syllables.
 *
 * Rules follow the script's own feature chart (isibheqe.org.za, "ingcazo"):
 *   - a bare stop or click is aspirated (ph, th, kh, ch, qh, xh)
 *   - the voicing line "-" marks voiced / breathy consonants (bh, d, g, v, z …)
 *   - the dot "•" marks ejective, implosive or plain consonants (p, t, k, b, c …)
 *   - the open circle "°" on the apex marks prenasalisation, and a nasal click
 *   - isiZulu e and o are the closed triangles ɛ and ɔ
 *
 * The project's 2016 booklet (Incazo Yohlelo lwesiBheqe Sohlamvu, kaJanolintshi
 * and Mtake) shows pha / pa / bha / ba and mpha / mpa / mbha / mba drawn exactly
 * this way, and nza as circle + s + line. Extending the "mba" pattern (line and
 * dot for a plain voiced stop after a nasal) to nd and ng is by analogy.
 *
 * The idea of typing in ordinary spelling comes from Tracy's 2020 fork
 * (github.com/torazem/isibheqe). The table here is a fresh reading of the
 * chart and still wants review by people who write the script daily.
 */
import type { Consonant, SyllabicConsonant, Vowel } from '../core/glyph';
import type { Token } from '../core/text';

const VOWEL_LETTERS: Record<string, Vowel> = { a: 'a', e: 'ɛ', i: 'i', o: 'ɔ', u: 'u' };

/** Consonant spellings and the marks that write them. Longest match wins. */
const ONSETS: Record<string, Consonant[]> = {
  // stops
  ph: ['p'],
  p: ['p', '•'],
  bh: ['p', '-'],
  b: ['p', '-', '•'],
  th: ['t'],
  t: ['t', '•'],
  d: ['t', '-'],
  kh: ['k'],
  k: ['k', '•'],
  g: ['k', '-'],
  // fricatives and affricates
  f: ['f'],
  v: ['f', '-'],
  s: ['s'],
  z: ['s', '-'],
  sh: ['ʃ'],
  tsh: ['ʃ', 't', '•'],
  j: ['ʃ', 't', '-'],
  ts: ['t', 's', '•'],
  hl: ['ɬ'],
  dl: ['ɬ', '-'],
  h: ['h'],
  hh: ['-'],
  kl: ['k', 'x', '•'],
  // approximants
  l: ['l'],
  r: ['r'],
  w: ['w'],
  y: ['j'],
  // nasals
  m: ['°'],
  n: ['n'],
  ny: ['ɲ'],
  // clicks
  ch: ['|'],
  c: ['|', '•'],
  gc: ['|', '-'],
  qh: ['!'],
  q: ['!', '•'],
  gq: ['!', '-'],
  xh: ['||'],
  x: ['||', '•'],
  gx: ['||', '-'],
  // prenasalised
  mp: ['°', 'p', '•'],
  mb: ['°', 'p', '-', '•'],
  mbh: ['°', 'p', '-'],
  mph: ['°', 'p'],
  nt: ['°', 't', '•'],
  nd: ['°', 't', '-', '•'],
  nth: ['°', 't'],
  nk: ['°', 'k', '•'],
  ng: ['°', 'k', '-', '•'],
  nkh: ['°', 'k'],
  mf: ['°', 'f'],
  mv: ['°', 'f', '-'],
  ns: ['°', 's'],
  nz: ['°', 's', '-'],
  nts: ['°', 't', 's', '•'],
  ntsh: ['°', 'ʃ', 't', '•'],
  nj: ['°', 'ʃ', 't', '-'],
  nhl: ['°', 'ɬ'],
  ndl: ['°', 'ɬ', '-'],
  nkl: ['°', 'k', 'x', '•'],
  // nasal clicks
  nc: ['°', '|'],
  ngc: ['°', '|', '-'],
  nkc: ['°', '|', '•'],
  nq: ['°', '!'],
  ngq: ['°', '!', '-'],
  nkq: ['°', '!', '•'],
  nx: ['°', '||'],
  ngx: ['°', '||', '-'],
  nkx: ['°', '||', '•'],
};

const SYLLABIC_M = 'm̩' as SyllabicConsonant;
const SYLLABIC_N = 'n̩' as SyllabicConsonant;

function onsetMarks(spelling: string): Consonant[] | undefined {
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

function transcribeWord(word: string, out: Token[], unread: string[]): void {
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
      else if (run) unread.push(run);
      i = end + (forcedSyllabic ? 1 : 0);
      continue;
    }

    const marks = onsetMarks(run);
    if (marks) {
      out.push({
        kind: 'syllable',
        vowel: VOWEL_LETTERS[vowelLetter],
        consonants: marks,
        source: run + vowelLetter,
      });
    } else {
      unread.push(run);
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
 * Transcribe isiZulu text. Punctuation is dropped (the script's punctuation
 * is not specified yet); line breaks are kept. Write m' or n' to force a
 * syllabic nasal.
 */
export function transcribeZulu(text: string): Transcription {
  const tokens: Token[] = [];
  const unread: string[] = [];
  const lines = text.toLowerCase().split('\n');
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) tokens.push({ kind: 'newline' });
    const words = line.split(/[^a-z']+/).filter((w) => /[a-z]/.test(w));
    words.forEach((raw, wordIndex) => {
      if (wordIndex > 0) tokens.push({ kind: 'space' });
      // Keep the apostrophe only where it marks a lone m or n; elsewhere it is
      // an elision mark (ngob'ukuthi) and carries no sound.
      const word = raw.replace(/(?<!(?:^|[aeiou])[mn])'/g, '');
      transcribeWord(word, tokens, unread);
    });
  });
  return { tokens, unread };
}
