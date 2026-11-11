# isiBheqe soHlamvu · Ditema tsa Dinoko

A keyboard for [isiBheqe soHlamvu](https://isibheqe.org.za/), the featural syllabary for the
siNtu languages of southern Africa. Each triangle is one syllable: its direction gives the
vowel, and the marks drawn on it give the consonant.

The script is not yet in Unicode, so this tool draws it as an image (SVG or PNG).

## What it does

- **Type isiZulu** in ordinary spelling and see it written in isiBheqe.
- **Build by sound**: choose a vowel, then add consonant marks. This works for any language
  the script covers. The keyboard shortcuts are the ones the original tool used.
- **Learn**: six short steps to reading the script, the full chart of every consonant on
  every vowel (following the 2015 keyboard specification in `docs/`), and the script's own
  names for its parts.
- **About**: where the script comes from, who made it and where it stands, with a source for
  every claim.
- **Look inside a glyph**: choose any glyph to see which marks it is built from, and where
  each one is drawn.
- **Colour**: fill any enclosed part of a glyph, for art's sake. Colour carries no sound; it
  honours the beadwork and murals the script grew from. Colour is saved with the SVG and PNG.
- Text saved from the original 2015 tool loads unchanged.

It is three static pages (Write, Learn, About). No server, no accounts, no tracking.

## Sources and corrections

The Learn and About pages are written from published sources, listed at the foot of the About
page, by people outside the project. Thinly sourced claims are marked as such. If something
is wrong, missing or badly put, open an issue or a pull request. People who write the script,
and speakers of the languages it serves, have the last word.

## Credits

- The script and its forms are the work of the isiBheqe soHlamvu / Ditema tsa Dinoko project.
- The keyboard software was written by **Baruch Lubinsky** in 2015
  ([baruchlubinsky/isibheqe](https://github.com/baruchlubinsky/isibheqe)). His code is kept,
  untouched, in `legacy/`.
- Typing in ordinary spelling follows an idea from **Tracy**'s 2020 fork
  ([torazem/isibheqe](https://github.com/torazem/isibheqe)).

This edition (2026) rewrites the software and redesigns the page. The glyph shapes are not
redesigned: `tests/parity.test.ts` runs the 2015 code next to the new code and checks that
both produce the same strokes for every vowel with every consonant and every pair of
consonants. Two things differ on purpose:

- The nasal-vowel dot moves to the base side when ɲ or ŋ holds the apex, as the specification
  shows. The 2015 code only did this for n̪ and n.
- Lines of text sit closer together.

## Needs review

The isiZulu spelling rules in `src/input/zulu.ts` are a reading of the project's published
chart and 2016 booklet, not an official table. The booklet confirms the stop series
(pha, pa, bha, ba and mpha, mpa, mbha, mba); other clusters are by analogy. Corrections from people who write the script are welcome.
Punctuation and the null vowel (for consonants with no vowel) are not drawn yet.

## Development

```sh
pnpm install
pnpm dev      # run locally
pnpm test     # includes the parity check against legacy/
pnpm build    # static site in dist/
```

- `src/core/` turns syllables into strokes and SVG. It has no dependencies and does not need a
  browser.
- `src/input/zulu.ts` holds the isiZulu spelling rules.
- `index.html` with `src/main.ts` is the Write page; `learn.html` and `about.html` are the
  other two, with their scripts in `src/pages/`.
- `src/ui.ts`, `src/keys.ts`, `src/paint.ts` and `src/style.css` are shared.

## Licence

The fonts in `src/fonts/` keep their own licence, the SIL Open Font License: the heading face
is a reduced copy of Bricolage Grotesque by Mathieu Triay, and the phonetic label face is a
reduced, renamed copy of SIL's Charis (see `src/fonts/README.md`). Everything else:

This work is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0
International License, as the original was. To view a copy of this license, visit
<http://creativecommons.org/licenses/by-nc-sa/4.0/> or send a letter to Creative Commons,
PO Box 1866, Mountain View, CA 94042, USA.
