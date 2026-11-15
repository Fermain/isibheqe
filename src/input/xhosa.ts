/**
 * isiXhosa spelling → isiBheqe syllables. An experiment.
 *
 * isiXhosa shares most of its spelling with isiZulu, so this table starts
 * from the isiZulu one and adds what isiXhosa writes differently. Nothing
 * here comes from a published isiXhosa chart for the script: every entry
 * applies the script's own feature rules (bare = aspirated, line = voiced
 * or breathy, dot = ejective or plain, circle = prenasalised) to the sound
 * each spelling stands for. The sound values follow the standard
 * descriptions of isiXhosa orthography (e.g. the Wikipedia article "Xhosa
 * language", Phonology, which cites Jessen and Roux 2002 and others).
 *
 * How sure each group is:
 *   - ty / tyh / dy: sure of the sounds (palatal stops); the script has a
 *     palatal stop mark, so the reading is direct.
 *   - ths / thsh / dz: direct, by the same rule as isiZulu ts and tsh.
 *   - rh / gr: direct (the velar fricative mark, bare and voiced).
 *   - kr: the same sound class as isiZulu kl, so it is written the same way.
 *   - ng': direct (the velar nasal mark).
 *   - tl / ntl: a guess. The sound is an ejective lateral affricate; it is
 *     written here as t + hl + dot, the way ts is t + s + dot.
 *   - nh / nyh: a guess. Breathy nasals, written as the nasal plus the line.
 *     Breathy mh is not read: "mh" is far more often the prefix m- before an
 *     h- stem (umhambi), so it is read as a syllabic m.
 */
import type { Consonant } from '../core/glyph';
import { makeTranscriber } from './nguni';
import { ZULU_ONSETS } from './zulu';

export const XHOSA_ONSETS: Record<string, Consonant[]> = {
  ...ZULU_ONSETS,
  // palatal stops
  tyh: ['c'],
  ty: ['c', '•'],
  dy: ['c', '-'],
  nty: ['°', 'c', '•'],
  ndy: ['°', 'c', '-', '•'],
  // affricates: isiXhosa spells the aspirated ones out
  ths: ['t', 's'],
  dz: ['t', 's', '-'],
  ndz: ['°', 't', 's', '-'],
  thsh: ['ʃ', 't'],
  // velar fricatives and the velar affricate
  rh: ['x'],
  gr: ['x', '-'],
  kr: ['k', 'x', '•'],
  nkr: ['°', 'k', 'x', '•'],
  // lateral affricate
  tl: ['t', 'ɬ', '•'],
  ntl: ['°', 't', 'ɬ', '•'],
  // nasals
  ŋ: ['ŋ'],
  nh: ['n', '-'],
  nyh: ['ɲ', '-'],
};

/** Transcribe isiXhosa text. Same conventions as the isiZulu reader. */
export const transcribeXhosa = makeTranscriber({
  onsets: XHOSA_ONSETS,
  letters: { ŋ: "ng'" },
});
