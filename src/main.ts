import { isConsonant, type Consonant } from './core/glyph';
import { renderSvg, svgPadding } from './core/svg';
import {
  deserialize,
  glossHeight,
  layout,
  lineHeight,
  serialize,
  type Layout,
  type Token,
} from './core/text';
import { transcribeZulu } from './input/zulu';
import { KEY_FOR_SYMBOL, KEY_GROUPS, KEY_NAMES, PHYSICAL_KEYS } from './keys';
import { glyphAt, paint, toPixel, type Fill, type Painted } from './paint';
import { $, escapeHtml, glyphSvg, reading, spelled, tokenFor } from './ui';

type Mode = 'text' | 'sound';

const state = {
  mode: 'text' as Mode,
  text: 'Sawubona mhlaba',
  textTokens: [] as Token[],
  unread: [] as string[],
  soundTokens: [] as Token[],
  /** Colour fills, kept separately for each way of writing. */
  fills: { text: [] as Fill[], sound: [] as Fill[] },
  /** The colour being painted with, 'erase', or null when not painting. */
  brush: null as string | null,
  /** Show the Latin reading under each glyph. */
  gloss: true,
  /** Token index of the glyph shown in the anatomy panel. */
  selected: null as number | null,
};

const tokens = () => (state.mode === 'text' ? state.textTokens : state.soundTokens);
const fills = () => state.fills[state.mode];
const isGlyph = (t: Token | undefined) => t?.kind === 'syllable' || t?.kind === 'syllabic';

// ---------------------------------------------------------------- surface

const surface = $('surface');
const jsonBox = $<HTMLTextAreaElement>('json');
const status = $('status');

const PAINT_SCALE = 3;

/** What is currently on screen, for turning clicks back into glyphs. */
let view: { lay: Layout; unit: number; step: number; painted?: Painted } | undefined;

function surfaceUnit(): number {
  return surface.clientWidth < 700 ? 3 : 4;
}

/** Paint the colour layer, dropping fills that no longer have a closed region. */
function paintFills(lay: Layout, list: Fill[], unit: number, scale: number): Painted | undefined {
  if (list.length === 0) return undefined;
  let painted = paint(lay, list, unit, scale);
  if (painted.spilled.length > 0) {
    for (const i of [...painted.spilled].reverse()) list.splice(i, 1);
    if (list.length === 0) return undefined;
    painted = paint(lay, list, unit, scale);
  }
  return painted;
}

function render(): void {
  const list = tokens();
  const unit = surfaceUnit();
  const maxWidth = Math.max(surface.clientWidth - unit * 6 - 32, unit * 40);
  const said = reading(list).trim();

  if (!isGlyph(list[state.selected ?? -1])) state.selected = list.findLastIndex(isGlyph);
  if (state.selected === -1) state.selected = null;

  if (list.length === 0) {
    view = undefined;
    surface.innerHTML = `<p class="empty">${
      state.mode === 'text' ? 'Type some isiZulu below.' : 'Choose a vowel below to begin.'
    }</p>`;
  } else {
    const lay = layout(list, unit, maxWidth, state.gloss);
    const svg = renderSvg(lay, {
      unit,
      title: said || 'isiBheqe text',
      labels: state.gloss ? (i) => spelled(list[i]) : undefined,
      glyphAttrs: (i) => `data-index="${i}"${i === state.selected ? ' class="selected"' : ''}`,
    });
    surface.innerHTML = `<div class="sheet">${svg}</div>`;
    const painted = paintFills(lay, fills(), unit, PAINT_SCALE);
    if (painted) surface.firstElementChild!.prepend(painted.canvas);
    view = { lay, unit, step: lineHeight(unit) + (state.gloss ? glossHeight(unit) : 0), painted };
  }

  renderAnatomy(list);
  renderKeyboardState();
  if (document.activeElement !== jsonBox) jsonBox.value = serialize(list);

  const unread = $('unread');
  if (state.mode === 'text' && state.unread.length > 0) {
    const runs = [...new Set(state.unread)].map((r) => `“${escapeHtml(r)}”`).join(', ');
    unread.innerHTML = `Not read as isiZulu and left out: ${runs}.`;
    unread.hidden = false;
  } else {
    unread.hidden = true;
  }
}

surface.addEventListener('click', (event) => {
  const svg = surface.querySelector<SVGSVGElement>('.sheet > svg');
  if (!view || !svg) return;
  const { lay, unit, step, painted } = view;
  const box = svg.getBoundingClientRect();
  const pad = svgPadding(unit);
  const x = ((event.clientX - box.left) / box.width) * (lay.width + pad * 2) - pad;
  const y = ((event.clientY - box.top) / box.height) * (lay.height + pad);
  const glyph = glyphAt(lay, x, y, step);

  if (!state.brush) {
    if (glyph) {
      state.selected = glyph.index;
      render();
    }
    return;
  }

  const list = fills();
  if (painted) {
    // Repainting or erasing a region replaces the fill that owns it.
    const [px, py] = toPixel(x, y, unit, painted.scale);
    const owner = painted.owner[py * painted.width + px];
    if (owner > 0) list.splice(owner - 1, 1);
  }
  if (state.brush === 'erase') return render();
  if (!glyph) return say('Choose a spot inside a glyph to colour it.');
  const fill: Fill = {
    index: glyph.index,
    x: (x - glyph.at.x) / unit,
    y: (y - glyph.at.y) / unit,
    color: state.brush,
  };
  list.push(fill);
  render();
  if (!list.includes(fill)) say('That spot is on a line or outside the glyph, so nothing was filled.');
});

// ---------------------------------------------------------------- anatomy

const anatomy = $('anatomy');

function renderAnatomy(list: readonly Token[]): void {
  const token = state.selected === null ? undefined : list[state.selected];
  if (!token || (token.kind !== 'syllable' && token.kind !== 'syllabic')) {
    anatomy.hidden = true;
    return;
  }
  const marks: { by: string; label: string }[] =
    token.kind === 'syllabic'
      ? [{ by: token.letter, label: KEY_NAMES[token.letter] }]
      : [
          { by: token.vowel, label: `vowel: ${KEY_NAMES[token.vowel]}` },
          ...token.consonants.map((c) => ({ by: c, label: KEY_NAMES[c] ?? c })),
        ];
  const chips = marks
    .map(
      (m) =>
        `<li><button type="button" class="chip" data-by="${escapeHtml(m.by)}">` +
        `<span class="symbol" aria-hidden="true">${escapeHtml(m.by)}</span> ${escapeHtml(m.label)}</button></li>`,
    )
    .join('');
  anatomy.innerHTML =
    `<div class="specimen" aria-hidden="true">${glyphSvg(token, 5, true)}</div>` +
    `<div><h3><span class="spelled">${escapeHtml(spelled(token))}</span> is built from</h3>` +
    `<ul class="chips">${chips}</ul>` +
    `<p class="note">Point at a part to see where it is drawn. Choose another glyph above to look inside it.</p></div>`;
  anatomy.hidden = false;
}

function light(by: string | null): void {
  for (const el of document.querySelectorAll('.lit')) el.classList.remove('lit');
  if (by === null) return;
  const paths = document.querySelectorAll<SVGElement>(
    '#anatomy .specimen [data-by], #surface g.selected [data-by]',
  );
  for (const path of paths) if (path.dataset.by === by) path.classList.add('lit');
}

const chipOf = (event: Event) => (event.target as HTMLElement).closest<HTMLElement>('.chip');
anatomy.addEventListener('pointerover', (e) => light(chipOf(e)?.dataset.by ?? null));
anatomy.addEventListener('pointerleave', () => light(null));
anatomy.addEventListener('focusin', (e) => light(chipOf(e)?.dataset.by ?? null));
anatomy.addEventListener('focusout', () => light(null));

// ------------------------------------------------------------------ colour

const BEAD_COLOURS: [name: string, hex: string][] = [
  ['white', '#ffffff'],
  ['black', '#16161a'],
  ['red', '#d62828'],
  ['orange', '#f07f13'],
  ['yellow', '#f6c026'],
  ['green', '#2a9d4a'],
  ['blue', '#1f5fd0'],
  ['pink', '#f28cb1'],
];

const palette = $('palette');
const customColour = $<HTMLInputElement>('custom-colour');

function buildPalette(): void {
  palette.innerHTML = BEAD_COLOURS.map(
    ([name, hex]) =>
      `<button type="button" class="swatch" data-brush="${hex}" style="--swatch:${hex}" ` +
      `aria-label="Paint with ${name}" title="${name}" aria-pressed="false"></button>`,
  ).join('');
}

function setBrush(brush: string | null): void {
  state.brush = brush;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-brush]')) {
    button.setAttribute('aria-pressed', String(button.dataset.brush === brush));
  }
  surface.classList.toggle('painting', brush !== null);
  $('paint-hint').hidden = brush === null;
}

$('colour-tools').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-brush]');
  if (!button) return;
  const brush = button.dataset.brush!;
  setBrush(state.brush === brush ? null : brush);
});

customColour.addEventListener('input', () => setBrush(customColour.value));

$('clear-colours').addEventListener('click', () => {
  fills().length = 0;
  render();
});

$<HTMLInputElement>('show-gloss').addEventListener('change', (event) => {
  state.gloss = (event.target as HTMLInputElement).checked;
  render();
});

// ------------------------------------------------------------- text input

const textBox = $<HTMLTextAreaElement>('latin');

function readText(): void {
  state.text = textBox.value;
  const result = transcribeZulu(state.text);
  state.textTokens = result.tokens;
  state.unread = result.unread;
  state.fills.text = state.fills.text.filter((f) => isGlyph(result.tokens[f.index]));
}

textBox.value = state.text;
textBox.addEventListener('input', () => {
  readText();
  state.selected = null;
  render();
});

$('continue-by-sound').addEventListener('click', () => {
  state.soundTokens = structuredClone(state.textTokens);
  state.fills.sound = structuredClone(state.fills.text);
  setMode('sound');
  say('Copied to the sound keyboard.');
});

// ---------------------------------------------------------- sound keyboard

const keyboard = $('keyboard');

function currentSyllable(): Extract<Token, { kind: 'syllable' }> | undefined {
  const last = state.soundTokens.at(-1);
  return last?.kind === 'syllable' ? last : undefined;
}

function press(symbol: string): void {
  const list = state.soundTokens;
  if (symbol === 'space') list.push({ kind: 'space' });
  else if (symbol === 'newline') list.push({ kind: 'newline' });
  else if (symbol === 'backspace') {
    const current = currentSyllable();
    if (current && current.consonants.length > 0) current.consonants.pop();
    else list.pop();
  } else if (symbol === 'clear') list.length = 0;
  else if (isConsonant(symbol)) {
    const current = currentSyllable();
    if (!current) return;
    const at = current.consonants.indexOf(symbol);
    if (at >= 0) current.consonants.splice(at, 1);
    else current.consonants.push(symbol);
  } else {
    const token = tokenFor(symbol);
    if (token) list.push(token);
  }
  state.fills.sound = state.fills.sound.filter((f) => isGlyph(list[f.index]));
  state.selected = null;
  render();
}

function buildKeyboard(): void {
  const groups = KEY_GROUPS.map((group) => {
    const keys = group.keys
      .map((key) => {
        const preview = isConsonant(key.symbol)
          ? tokenFor(
              'i',
              key.symbol === 'l̩'
                ? (['l', key.symbol] as Consonant[])
                : key.symbol === 'r̩'
                  ? (['r', key.symbol] as Consonant[])
                  : [key.symbol],
            )!
          : tokenFor(key.symbol)!;
        const physical = KEY_FOR_SYMBOL[key.symbol];
        return (
          `<button type="button" class="key" data-symbol="${escapeHtml(key.symbol)}" ` +
          `aria-label="${escapeHtml(key.name)}" title="${escapeHtml(key.name)}">` +
          `<span class="glyph" aria-hidden="true">${glyphSvg(preview, 2, true)}</span>` +
          `<span class="ipa" aria-hidden="true">${escapeHtml(key.symbol)}</span>` +
          (physical ? `<kbd aria-hidden="true">${escapeHtml(physical)}</kbd>` : '') +
          `</button>`
        );
      })
      .join('');
    return (
      `<fieldset class="key-group"><legend>${escapeHtml(group.title)}</legend>` +
      (group.note ? `<p class="note">${escapeHtml(group.note)}</p>` : '') +
      `<div class="keys">${keys}</div></fieldset>`
    );
  });
  keyboard.innerHTML = groups.join('');
}

function renderKeyboardState(): void {
  const current = currentSyllable();
  $('vowel-first').hidden = !!current;
  for (const button of keyboard.querySelectorAll<HTMLButtonElement>('.key')) {
    const symbol = button.dataset.symbol!;
    if (!isConsonant(symbol)) continue;
    button.disabled = !current;
    button.setAttribute('aria-pressed', String(!!current && current.consonants.includes(symbol)));
  }
}

keyboard.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.key');
  if (button?.dataset.symbol) press(button.dataset.symbol);
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-press]')) {
  button.addEventListener('click', () => press(button.dataset.press!));
}

document.addEventListener('keydown', (event) => {
  if (state.mode !== 'sound' || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement;
  if (target.matches('textarea, input, select')) return;
  const onControl = target.matches('button, summary, a');
  let symbol: string | undefined;
  if (event.key === 'Backspace') symbol = 'backspace';
  else if (event.key === ' ' && !onControl) symbol = 'space';
  else if (event.key === 'Enter' && !onControl) symbol = 'newline';
  else symbol = PHYSICAL_KEYS[event.key];
  if (!symbol) return;
  event.preventDefault();
  press(symbol);
});

// ------------------------------------------------------------------ modes

const tabs: Record<Mode, HTMLButtonElement> = {
  text: $<HTMLButtonElement>('tab-text'),
  sound: $<HTMLButtonElement>('tab-sound'),
};
const panels: Record<Mode, HTMLElement> = { text: $('panel-text'), sound: $('panel-sound') };

function setMode(mode: Mode): void {
  state.mode = mode;
  state.selected = null;
  for (const m of ['text', 'sound'] as Mode[]) {
    tabs[m].setAttribute('aria-selected', String(m === mode));
    tabs[m].tabIndex = m === mode ? 0 : -1;
    panels[m].hidden = m !== mode;
  }
  render();
}

for (const mode of ['text', 'sound'] as Mode[]) {
  tabs[mode].addEventListener('click', () => setMode(mode));
  tabs[mode].addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const other: Mode = mode === 'text' ? 'sound' : 'text';
    setMode(other);
    tabs[other].focus();
  });
}

// ----------------------------------------------------------------- export

let statusTimer = 0;
function say(message: string): void {
  status.textContent = message;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => (status.textContent = ''), 5000);
}

const EXPORT_UNIT = 4;

function exportSvg(scale = 1): string | undefined {
  const list = tokens();
  if (list.length === 0) {
    say('Nothing to export yet.');
    return undefined;
  }
  const lay = layout(list, EXPORT_UNIT, EXPORT_UNIT * 200);
  const pad = svgPadding(EXPORT_UNIT);
  // Colour travels with the export as an image layer under the strokes.
  const painted = paintFills(lay, [...fills()], EXPORT_UNIT, 4);
  const underlay = painted
    ? `<image href="${painted.canvas.toDataURL('image/png')}" x="${-pad}" y="0" ` +
      `width="${lay.width + pad * 2}" height="${lay.height + pad}"/>`
    : undefined;
  return renderSvg(lay, {
    unit: EXPORT_UNIT,
    title: reading(list).trim(),
    color: '#000',
    scale,
    underlay,
  });
}

/** A file name made from what is written: letters and digits kept, the rest turned into hyphens. */
function fileName(): string {
  const name = reading(tokens())
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return name || 'isibheqe';
}

function download(blob: Blob, extension: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName()}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

$('export-svg').addEventListener('click', () => {
  const svg = exportSvg();
  if (!svg) return;
  download(new Blob([svg], { type: 'image/svg+xml' }), 'svg');
  say('Saved as SVG.');
});

$('export-png').addEventListener('click', () => {
  const svg = exportSvg(4);
  if (!svg) return;
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return say('Could not make the PNG.');
      download(blob, 'png');
      say('Saved as PNG.');
    });
  };
  image.onerror = () => say('Could not make the PNG.');
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
});

$('copy-svg').addEventListener('click', async () => {
  const svg = exportSvg();
  if (!svg) return;
  try {
    await navigator.clipboard.writeText(svg);
    say('SVG copied.');
  } catch {
    say('Copying was blocked by the browser. Use Save SVG instead.');
  }
});

$('load-json').addEventListener('click', () => {
  const error = $('json-error');
  try {
    state.soundTokens = deserialize(jsonBox.value);
    state.fills.sound = [];
    error.hidden = true;
    setMode('sound');
    say('Loaded.');
  } catch (e) {
    error.textContent = `Could not load that: ${e instanceof Error ? e.message : String(e)}`;
    error.hidden = false;
  }
});

// ------------------------------------------------------------------- boot

buildPalette();
buildKeyboard();
readText();
setMode('text');
new ResizeObserver(() => render()).observe(surface);
