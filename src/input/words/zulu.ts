/**
 * A sample isiZulu word list. A proof of concept, not a dictionary.
 *
 * The reader in ../nguni.ts works by rule, and one thing the spelling does
 * not show is whether "m" before b, p, f or v is a syllable by itself (the
 * class prefix um- or the object marker -m-) or part of a prenasalised
 * consonant. The rule only splits it after a word-initial u, so it reads
 * umfula correctly and emfuleni wrongly. Compare:
 *
 *   emfuleni    e-m-fu-le-ni    "at the river", from umfula: the m is the prefix
 *   emfundweni  e-mfu-ndwe-ni   "in education", from imfundo: mf is one consonant
 *
 * Only words the rule gets wrong belong here; a test keeps the list to that.
 * Each entry is the word divided into syllables with hyphens.
 *
 * The entries and glosses were written from memory by a non-speaker and have
 * not been checked by a speaker of isiZulu.
 */
import type { Words } from '../nguni';

export const ZULU_WORDS: Words = {
  // The prefix um- after a locative, "and" or "by": the u is gone, the m stays a syllable.
  emfuleni: 'e-m-fu-le-ni', // at the river (umfula)
  emphakathini: 'e-m-pha-ka-thi-ni', // in the community (umphakathi)
  nomfana: 'no-m-fa-na', // and the boy (umfana)
  nomfazi: 'no-m-fa-zi', // and the woman (umfazi)
  ngomfana: 'ngo-m-fa-na', // about the boy
  // The object marker -m- (him, her) before a verb stem.
  ngiyambona: 'ngi-ya-m-bo-na', // I see him or her
  ngiyamfuna: 'ngi-ya-m-fu-na', // I want him or her
  siyambonga: 'si-ya-m-bo-nga', // we thank him or her
  // The other way round: a word that begins u + mp, where mp is one consonant.
  // Least certain entry: it rests on the plural being ompetha (class 1a).
  umpetha: 'u-mpe-tha', // champion, expert
};
