# Fonts

Both typefaces here are served with the page itself, so no visitor's request goes to a font
service. Both are under the SIL Open Font License 1.1.

## Bricolage Grotesque (headings and labels)

`BricolageGrotesque-ExtraBold.woff2` and `BricolageGrotesque-Bold.woff2` are reduced copies of
Bricolage Grotesque by Mathieu Triay (<https://github.com/ateliertriay/bricolage>). See
`OFL-BricolageGrotesque.txt`. The licence names no Reserved Font Name, so the reduced copies
keep the name.

What was changed:

- Reduced to basic Latin, Latin-1, Latin Extended-A and a few punctuation marks.
- Converted to WOFF2.
- The ExtraBold file is the 96pt (display) cut, used for headings. The Bold file is the
  standard cut, used for small labels.

Known gap: the typeface has no Tshivenḓa letters (ḓ, ḽ, ṋ, ṱ, ṅ) and no combining circumflex
below. A heading that uses one will show that letter in a fallback font. No heading does at
present.

To rebuild: take `fonts/ttf/BricolageGrotesque96pt-ExtraBold.ttf` and
`fonts/ttf/BricolageGrotesque-Bold.ttf` from the repository above and subset them with
fontTools (`pyftsubset`, all layout features kept,
`U+0020-007E,U+00A0-017F,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026`).

## Bheqe Labels (phonetic labels)

`BheqeLabels-Regular.woff2` and `BheqeLabels-Bold.woff2` set the phonetic (IPA) labels. They
are a **modified version of Charis 7.000** by SIL Global (<https://software.sil.org/charis/>).
See `OFL-Charis.txt`.

What was changed:

- Reduced to the characters the page needs: Latin, IPA extensions, modifier letters, combining
  marks, the click letters, and a few punctuation marks.
- Converted to WOFF2.
- Renamed to "Bheqe Labels". The licence reserves the names "Charis" and "SIL" for the
  unmodified fonts, so a reduced copy may not carry them.

To rebuild: download `Charis-7.000.zip` from
<https://github.com/silnrsi/font-charis/releases/tag/v7.000> and subset `Charis-Regular.ttf`
and `Charis-Bold.ttf` with fontTools (`pyftsubset`, all layout features kept), then set the
family name.
