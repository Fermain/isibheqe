/**
 * A sample isiXhosa word list. A proof of concept, not a dictionary.
 *
 * It lists words in which "m" before b, p, f or v is a syllable by itself
 * and the rule in ../nguni.ts cannot tell; see ./zulu.ts for the reasoning.
 * Each entry is the word divided into syllables with hyphens.
 *
 * The entries and glosses were written from memory by a non-speaker and have
 * not been checked by a speaker of isiXhosa.
 */
import type { Words } from '../nguni';

export const XHOSA_WORDS: Words = {
  // The prefix um- after a locative, "and" or "by".
  emfuleni: 'e-m-fu-le-ni', // at the river (umfula)
  emphakathini: 'e-m-pha-ka-thi-ni', // inside, in the community (umphakathi)
  nomfana: 'no-m-fa-na', // and the young man (umfana)
  nomfazi: 'no-m-fa-zi', // and the woman (umfazi)
  ngomfanekiso: 'ngo-m-fa-ne-ki-so', // by a picture (umfanekiso)
  // The object marker -m- (him, her) before a verb stem.
  ndiyambona: 'ndi-ya-m-bo-na', // I see him or her
  ndiyamfuna: 'ndi-ya-m-fu-na', // I want him or her
  siyambulela: 'si-ya-m-bu-le-la', // we thank him or her
};
