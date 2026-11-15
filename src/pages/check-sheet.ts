/**
 * A printable proofreading sheet for the tessellated layout: common isiZulu
 * words drawn as the ordinary line and tessellated, side by side. Served by
 * the dev server only; it is not one of the built pages.
 */
import { renderSvg } from '../core/svg';
import { tessellate } from '../core/tessellate';
import { layout, type Layout, type Token } from '../core/text';
import { transcribeZulu } from '../input/zulu';

const GROUPS: [title: string, words: [zulu: string, english: string][]][] = [
  [
    'Greetings',
    [
      ['sawubona', 'hello (to one person)'],
      ['sanibonani', 'hello (to several)'],
      ['unjani', 'how are you?'],
      ['ngiyaphila', 'I am well'],
      ['yebo', 'yes'],
      ['cha', 'no'],
      ['ngiyabonga', 'thank you'],
      ['siyabonga', 'we thank you'],
      ['hamba kahle', 'go well'],
      ['sala kahle', 'stay well'],
    ],
  ],
  [
    'People',
    [
      ['umuntu', 'person'],
      ['abantu', 'people'],
      ['umama', 'mother'],
      ['ubaba', 'father'],
      ['ingane', 'child'],
      ['umfana', 'boy'],
      ['intombazane', 'girl'],
      ['umngane', 'friend'],
      ['igama', 'name'],
    ],
  ],
  [
    'Home and food',
    [
      ['indlu', 'house'],
      ['ikhaya', 'home'],
      ['isikole', 'school'],
      ['incwadi', 'book, letter'],
      ['amanzi', 'water'],
      ['ukudla', 'food'],
      ['isinkwa', 'bread'],
      ['ubisi', 'milk'],
      ['inyama', 'meat'],
      ['iqanda', 'egg'],
    ],
  ],
  [
    'The world',
    [
      ['ilanga', 'sun, day'],
      ['inyanga', 'moon, month'],
      ['inkanyezi', 'star'],
      ['imvula', 'rain'],
      ['umlilo', 'fire'],
      ['umhlaba', 'earth, world'],
      ['isihlahla', 'tree'],
      ['inja', 'dog'],
      ['ikati', 'cat'],
      ['inkomo', 'cow'],
      ['inyoni', 'bird'],
      ['indlovu', 'elephant'],
      ['ibhubesi', 'lion'],
      ['ixoxo', 'frog'],
    ],
  ],
  [
    'Ideas',
    [
      ['uthando', 'love'],
      ['ukuthula', 'peace'],
      ['ubuntu', 'humanity'],
      ['iqiniso', 'truth'],
      ['inhliziyo', 'heart'],
      ['umculo', 'music'],
      ['izwi', 'word, voice'],
      ['ulimi', 'tongue, language'],
      ['isiZulu', 'the Zulu language'],
    ],
  ],
  [
    'Numbers and days',
    [
      ['kunye', 'one'],
      ['kubili', 'two'],
      ['kuthathu', 'three'],
      ['kune', 'four'],
      ['kuhlanu', 'five'],
      ['namhlanje', 'today'],
      ['kusasa', 'tomorrow'],
      ['izolo', 'yesterday'],
    ],
  ],
  [
    'Phrases',
    [
      ['isibheqe sohlamvu', "the script's isiZulu name"],
      ['uhlelo lokuloba amazwi', 'a system for writing words'],
      ['umuntu ngumuntu ngabantu', 'a person is a person through people'],
    ],
  ],
];

const UNIT = 4;
const escape = (s: string) =>
  s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const spelled = (t: Token) => ('source' in t && t.source) || '';

function draw(lay: Layout, tokens: readonly Token[], title: string): string {
  // One reading per shape: syllables that share a square are joined with a dot.
  const squares = new Map<number, number[]>();
  for (const g of lay.glyphs) {
    const key = g.cell ?? g.index;
    squares.set(key, [...(squares.get(key) ?? []), g.index]);
  }
  const first = new Map([...squares.values()].map((members) => [members[0], members]));
  return renderSvg(lay, {
    unit: UNIT,
    title,
    color: '#121110',
    labels: (i) => first.get(i)?.map((m) => spelled(tokens[m])).join('·'),
  });
}

let html = '';
for (const [title, words] of GROUPS) {
  html +=
    `<h2>${escape(title)}</h2><table><thead><tr><th>Word</th><th>Line</th>` +
    `<th>Tessellated</th><th>Reads well?</th><th>Notes</th></tr></thead><tbody>`;
  for (const [zulu, english] of words) {
    const { tokens, unread } = transcribeZulu(zulu);
    const warn = unread.length ? ` (not read: ${escape(unread.join(', '))})` : '';
    html +=
      `<tr><td class="word"><b lang="zu">${escape(zulu)}</b><span>${escape(english)}${warn}</span></td>` +
      `<td class="glyphs">${draw(layout(tokens, UNIT, Infinity, true), tokens, zulu)}</td>` +
      `<td class="glyphs">${draw(tessellate(tokens, UNIT, Infinity, true), tokens, zulu)}</td>` +
      `<td class="ok" data-word="${escape(zulu)}">` +
      ['yes', 'no']
        .map(
          (v) =>
            `<label><input type="radio" name="ok:${escape(zulu)}" value="${v}" /> ${v}</label>`,
        )
        .join(' ') +
      `</td><td class="notes"><textarea rows="2" data-word="${escape(zulu)}" ` +
      `aria-label="Notes on ${escape(zulu)}"></textarea></td></tr>`;
  }
  html += '</tbody></table>';
}
const sheet = document.getElementById('sheet')!;
sheet.innerHTML = html;

// ------------------------------------------------------------- answers
// Ticks and notes are saved through the dev server to check-sheet.results.json.

interface Answer {
  ok?: 'yes' | 'no';
  notes?: string;
}
type Answers = Record<string, Answer>;

const ENDPOINT = '/__check-sheet';
const saved = document.getElementById('saved')!;
let answers: Answers = {};

function show(): void {
  for (const [word, answer] of Object.entries(answers)) {
    const key = CSS.escape(word);
    const radio = sheet.querySelector<HTMLInputElement>(
      `input[name="ok:${key}"][value="${answer.ok ?? ''}"]`,
    );
    if (radio) radio.checked = true;
    const notes = sheet.querySelector<HTMLTextAreaElement>(`textarea[data-word="${key}"]`);
    if (notes) notes.value = answer.notes ?? '';
  }
  count();
}

function count(): void {
  const list = Object.values(answers);
  const yes = list.filter((a) => a.ok === 'yes').length;
  const no = list.filter((a) => a.ok === 'no').length;
  const total = sheet.querySelectorAll('td.ok').length;
  document.getElementById('progress')!.textContent =
    `${yes + no} of ${total} answered: ${yes} yes, ${no} no.`;
}

let timer = 0;
function save(): void {
  count();
  saved.textContent = 'Saving…';
  window.clearTimeout(timer);
  timer = window.setTimeout(async () => {
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify(answers) });
      saved.textContent = response.ok ? 'Saved.' : 'Could not save.';
    } catch {
      saved.textContent = 'Could not save: is the dev server running?';
    }
  }, 300);
}

sheet.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.type !== 'radio') return;
  const word = input.closest<HTMLElement>('td.ok')!.dataset.word!;
  answers[word] = { ...answers[word], ok: input.value as 'yes' | 'no' };
  save();
});

sheet.addEventListener('input', (event) => {
  const box = event.target as HTMLTextAreaElement;
  if (box.tagName !== 'TEXTAREA') return;
  const word = box.dataset.word!;
  answers[word] = { ...answers[word], notes: box.value };
  save();
});

fetch(ENDPOINT)
  .then((response) => response.json())
  .then((data: Answers) => {
    answers = data;
    show();
  })
  .catch(() => {
    saved.textContent = 'Answers cannot be saved here: open this page through the dev server.';
    count();
  });
