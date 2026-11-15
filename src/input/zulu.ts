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
import type { Consonant } from '../core/glyph';
import { makeTranscriber, type Transcription } from './nguni';

export type { Transcription };

/** Consonant spellings and the marks that write them. Longest match wins. */
export const ZULU_ONSETS: Record<string, Consonant[]> = {
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

/**
 * Transcribe isiZulu text. Punctuation is dropped (the script's punctuation
 * is not specified yet); line breaks are kept. Write m' or n' to force a
 * syllabic nasal.
 */
export const transcribeZulu = makeTranscriber({ onsets: ZULU_ONSETS });
