/** The Learn page: small live examples for each step, and the full chart. */
import { VOWELS, type Consonant, type Vowel } from '../core/glyph';
import type { Token } from '../core/text';
import { CHART, KEY_NAMES } from '../keys';
import { $, escapeHtml, glyphSvg, zuluLine } from '../ui';

const syllable = (vowel: Vowel, consonants: Consonant[] = []): Token => ({
  kind: 'syllable',
  vowel,
  consonants,
});

function choiceButtons(
  host: HTMLElement,
  choices: { value: string; label: string; name: string }[],
  onChoose: (value: string) => void,
  initial: string,
): void {
  host.innerHTML = choices
    .map(
      (c) =>
        `<button type="button" data-value="${escapeHtml(c.value)}" aria-pressed="${c.value === initial}" ` +
        `aria-label="${escapeHtml(c.name)}">${escapeHtml(c.label)}</button>`,
    )
    .join('');
  host.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    for (const b of host.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b === button));
    }
    onChoose(button.dataset.value!);
  });
  onChoose(initial);
}

// Step 1: the vowel is the shape.
const VOWEL_ORDER: Vowel[] = ['i', 'a', 'u', 'ɛ', 'ɔ', 'e', 'o'];
const VOWEL_SHAPE: Record<Vowel, string> = {
  i: 'closed, pointing up',
  a: 'closed, pointing down',
  u: 'open, pointing up',
  ɛ: 'closed, pointing left',
  ɔ: 'closed, pointing right',
  e: 'open, pointing left',
  o: 'open, pointing right',
};
choiceButtons(
  $('vowel-picker'),
  VOWEL_ORDER.map((v) => ({ value: v, label: v, name: KEY_NAMES[v] })),
  (v) => {
    const vowel = v as Vowel;
    $('vowel-specimen').innerHTML =
      glyphSvg(syllable(vowel), 5, true) +
      `<p><b class="ipa">${vowel}</b> ${escapeHtml(KEY_NAMES[vowel])}: ${VOWEL_SHAPE[vowel]}</p>`;
  },
  'i',
);

// Step 2: one mark across every vowel.
const PLACES: { mark: Consonant; label: string; where: string }[] = [
  { mark: 'p', label: 'ph', where: 'lips, a stop: a bar at the point' },
  { mark: 't', label: 'th', where: 'tongue tip, a stop: a line across the middle' },
  { mark: 'k', label: 'kh', where: 'back of the mouth, a stop: a small peak at the base' },
  { mark: 'f', label: 'f', where: 'lips, a fricative: a curve at the point' },
  { mark: 's', label: 's', where: 'tongue tip, a fricative: a curve across the middle' },
  { mark: 'x', label: '[x]', where: 'back of the mouth, a fricative: a curve at the base' },
];
choiceButtons(
  $('place-picker'),
  PLACES.map((p) => ({ value: p.mark, label: p.label, name: p.where })),
  (m) => {
    const place = PLACES.find((p) => p.mark === m)!;
    $('place-specimen').innerHTML =
      `<div class="row">${VOWEL_ORDER.map((v) => glyphSvg(syllable(v, [place.mark]), 3, true)).join('')}</div>` +
      `<p>${escapeHtml(place.where)}</p>`;
  },
  'p',
);

// Step 3: the line and the dot, on p + a as the project's booklet shows them.
const voice = { line: false, dot: false };
const VOICE_SPELLING = ['pha', 'pa', 'bha', 'ba'];
const VOICE_SOUND = [
  'p with a puff of air',
  'p with the breath held (ejective)',
  'voiced, with breath',
  'b with the breath drawn in (implosive)',
];
function showVoice(): void {
  const marks: Consonant[] = ['p', ...(voice.line ? (['-'] as Consonant[]) : []), ...(voice.dot ? (['•'] as Consonant[]) : [])];
  const which = (voice.line ? 2 : 0) + (voice.dot ? 1 : 0);
  $('voice-specimen').innerHTML =
    glyphSvg(syllable('a', marks), 5, true) +
    `<p><b>${VOICE_SPELLING[which]}</b> ${VOICE_SOUND[which]}</p>`;
}
for (const key of ['line', 'dot'] as const) {
  const button = $<HTMLButtonElement>(`toggle-${key}`);
  button.addEventListener('click', () => {
    voice[key] = !voice[key];
    button.setAttribute('aria-pressed', String(voice[key]));
    showVoice();
  });
}
showVoice();

// Steps 4 to 6: isiZulu examples drawn with their spelling beneath.
for (const host of document.querySelectorAll<HTMLElement>('[data-zulu]')) {
  host.innerHTML = zuluLine(host.dataset.zulu!, 4, host.classList.contains('line') ? 780 : Infinity);
}

const tryText = $<HTMLInputElement>('try-text');
const showTry = () => {
  $('try-out').innerHTML = tryText.value.trim() ? zuluLine(tryText.value, 4, 780) : '';
};
tryText.addEventListener('input', showTry);
showTry();

// The reference chart.
$('chart-table').innerHTML =
  `<thead><tr><th scope="col"><span class="sr-only">Consonant</span></th>` +
  VOWELS.map((vowel) => `<th scope="col">${vowel}</th>`).join('') +
  `</tr></thead>` +
  CHART.map(
    (section) =>
      `<tbody><tr class="section"><th scope="colgroup" colspan="${VOWELS.length + 1}">${escapeHtml(section.title)}</th></tr>` +
      section.rows
        .map(
          (r) =>
            `<tr><th scope="row">${escapeHtml(r.label)}</th>` +
            VOWELS.map(
              (vowel) =>
                `<td><span class="cell" role="img" aria-label="${escapeHtml(
                  (r.marks.length ? r.label + ' + ' : '') + vowel,
                )}">${glyphSvg(syllable(vowel, r.marks), 2, true)}</span></td>`,
            ).join('') +
            `</tr>`,
        )
        .join('') +
      `</tbody>`,
  ).join('');
