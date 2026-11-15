/**
 * The Arrange page: a board where the glyphs of a word are moved by hand
 * into a pattern. core/board.ts holds the rules; this file is the pointer,
 * keyboard, colour and export handling around them.
 */
import { BASE, type Point } from '../core/geometry';
import {
  boardLayout,
  check,
  draw,
  lineUp,
  normalise,
  suggest,
  targets,
  type BoardLayout,
  type Target,
  type Tile,
} from '../core/board';
import { renderSvg, svgPadding } from '../core/svg';
import type { Token } from '../core/text';
import { transcribeZulu } from '../input/zulu';
import { glyphAt, paint, toPixel, type Fill, type Painted } from '../paint';
import { $, escapeHtml, reading, spelled } from '../ui';

/** Size of the board on screen; smaller on narrow screens so a word fits. */
const UNIT = window.innerWidth < 700 ? 4 : 6;
const SIDE = BASE * UNIT;
const PAINT_SCALE = 3;

interface Drag {
  index: number;
  /** Where the pointer went down, in board units. */
  from: Point;
  list: Target[];
  hot: number;
  nearest: number;
}

const state = {
  text: 'Sawubona',
  tokens: [] as Token[],
  unread: [] as string[],
  tiles: [] as Tile[],
  fills: [] as Fill[],
  brush: null as string | null,
  selected: null as number | null,
  drag: null as Drag | null,
};

const surface = $('surface');
const status = $('status');
let view: { lay: BoardLayout; painted?: Painted } | undefined;

let statusTimer = 0;
function say(message: string): void {
  status.textContent = message;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => (status.textContent = ''), 7000);
}

const tileOf = (index: number | null) => state.tiles.find((t) => t.index === index);

// ------------------------------------------------------------------ drawing

const n = (v: number) => String(Math.round(v * 100) / 100);

/** The faint lattice: every square of the view, with its diagonals. */
function gridPath(lay: BoardLayout): string {
  let d = '';
  for (let c = 0; c <= lay.cols; c++) d += `M${n(c * SIDE)} 0V${n(lay.height)}`;
  for (let r = 0; r <= lay.rows; r++) d += `M0 ${n(r * SIDE)}H${n(lay.width)}`;
  for (let c = 0; c < lay.cols; c++) {
    for (let r = 0; r < lay.rows; r++) {
      const [x, y] = [c * SIDE, r * SIDE];
      d += `M${n(x)} ${n(y)}l${SIDE} ${SIDE}M${n(x + SIDE)} ${n(y)}l${-SIDE} ${SIDE}`;
    }
  }
  return `<path class="grid" d="${d}" stroke-width="${n(UNIT / 8)}"/>`;
}

/** Where a target sits on screen: its outline and the point the pointer is measured against. */
function targetShape(target: Target, tile: Tile, lay: BoardLayout): { d: string; centre: Point } {
  const x = (target.col - lay.origin.col) * SIDE;
  const y = (target.row - lay.origin.row) * SIDE;
  if (target.insert) {
    // A new column: a bar on the line where it would open up.
    const w = SIDE * 0.1;
    return {
      d: `M${n(x - w)} ${n(y + w)}h${n(w * 2)}v${n(SIDE - w * 2)}h${n(-w * 2)}z`,
      centre: { x, y: y + SIDE / 2 },
    };
  }
  if (state.tokens[tile.index].kind === 'syllable') {
    // The triangle the glyph would fill there.
    const { origin, apex, base } = draw({ ...tile, col: target.col, row: target.row }, state.tokens, UNIT).frame;
    const dx = -lay.origin.col * SIDE;
    const dy = -lay.origin.row * SIDE;
    const at = (p: Point) => `${n(p.x + dx)} ${n(p.y + dy)}`;
    return {
      d: `M${at(origin)}L${at(apex)}L${at(base)}z`,
      centre: { x: (origin.x + apex.x + base.x) / 3 + dx, y: (origin.y + apex.y + base.y) / 3 + dy },
    };
  }
  const inset = SIDE * 0.08;
  return {
    d: `M${n(x + inset)} ${n(y + inset)}h${n(SIDE - inset * 2)}v${n(SIDE - inset * 2)}h${n(inset * 2 - SIDE)}z`,
    centre: { x: x + SIDE / 2, y: y + SIDE / 2 },
  };
}

function paintFills(lay: BoardLayout, list: Fill[], unit: number, scale: number): Painted | undefined {
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
  const { tokens, tiles, drag } = state;
  if (tiles.length === 0) {
    view = undefined;
    surface.innerHTML = '<p class="empty">Type a word above.</p>';
  } else {
    const lay = boardLayout(tiles, tokens, UNIT, 1);
    let underlay = gridPath(lay);
    if (drag) {
      const tile = tileOf(drag.index)!;
      drag.list.forEach((target, i) => {
        if (target.violation) return;
        underlay += `<path class="target" data-target="${i}" d="${targetShape(target, tile, lay).d}"/>`;
      });
    }
    const svg = renderSvg(lay, {
      unit: UNIT,
      title: reading(tokens).trim(),
      underlay,
      glyphAttrs: (i) => `data-index="${i}"${i === state.selected ? ' class="selected"' : ''}`,
    });
    surface.innerHTML = `<div class="sheet">${svg}</div>`;
    const painted = drag ? undefined : paintFills(lay, state.fills, UNIT, PAINT_SCALE);
    if (painted) surface.firstElementChild!.prepend(painted.canvas);
    view = { lay, painted };
  }
  surface.classList.toggle('dragging', !!drag);

  $('reading').innerHTML = tokens
    .map((t, i) => {
      const text = escapeHtml(spelled(t));
      return i === state.selected ? `<b>${text}</b>` : text;
    })
    .join('');

  const chosen = tileOf(state.selected);
  const button = $<HTMLButtonElement>('toggle-size');
  const fixed = !chosen || tokens[chosen.index].kind !== 'syllable';
  button.disabled = fixed;
  button.textContent = chosen?.size === 'flat' ? 'Make full size' : 'Make flat';

  const unread = $('unread');
  unread.hidden = state.unread.length === 0;
  if (state.unread.length > 0) {
    const runs = [...new Set(state.unread)].map((r) => `“${escapeHtml(r)}”`).join(', ');
    unread.innerHTML = `Not read as isiZulu and left out: ${runs}.`;
  }
}

// ------------------------------------------------------------------- moving

/** Apply an arrangement if it breaks no rule; otherwise say which rule and leave things be. */
function attempt(next: Tile[]): boolean {
  const tidy = normalise(next);
  const violation = check(tidy, state.tokens);
  if (violation) {
    say(violation.message);
    return false;
  }
  state.tiles = tidy;
  return true;
}

function toBoard(event: PointerEvent | MouseEvent): Point | undefined {
  const svg = surface.querySelector<SVGSVGElement>('.sheet > svg');
  if (!view || !svg) return undefined;
  const box = svg.getBoundingClientRect();
  const pad = svgPadding(UNIT);
  return {
    x: ((event.clientX - box.left) / box.width) * (view.lay.width + pad * 2) - pad,
    y: ((event.clientY - box.top) / box.height) * (view.lay.height + pad),
  };
}

let press: { index: number; from: Point; clientX: number; clientY: number } | undefined;

surface.addEventListener('pointerdown', (event) => {
  const at = toBoard(event);
  if (!at || !view || state.brush) return;
  const glyph = glyphAt(view.lay, at.x, at.y, SIDE);
  if (!glyph) return;
  press = { index: glyph.index, from: at, clientX: event.clientX, clientY: event.clientY };
  surface.setPointerCapture(event.pointerId);
});

surface.addEventListener('pointermove', (event) => {
  if (!press || !view) return;
  if (!state.drag) {
    if (Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) < 5) return;
    state.selected = press.index;
    state.drag = {
      index: press.index,
      from: press.from,
      list: targets(state.tiles, state.tokens, press.index),
      hot: -1,
      nearest: -1,
    };
    render();
  }
  const drag = state.drag;
  const at = toBoard(event);
  if (!at || !view) return;
  const lifted = surface.querySelector<SVGGElement>(`g[data-index="${drag.index}"]`);
  lifted?.classList.add('lifted');
  lifted?.setAttribute('transform', `translate(${n(at.x - drag.from.x)} ${n(at.y - drag.from.y)})`);

  // The nearest place, allowed or not; it is lit only if it is allowed.
  const tile = tileOf(drag.index)!;
  let best = -1;
  let bestDistance = SIDE * 0.75;
  drag.list.forEach((target, i) => {
    const { centre } = targetShape(target, tile, view!.lay);
    const d = Math.hypot(centre.x - at.x, centre.y - at.y);
    if (d < bestDistance) [best, bestDistance] = [i, d];
  });
  drag.nearest = best;
  const hot = best >= 0 && !drag.list[best].violation ? best : -1;
  if (hot !== drag.hot) {
    surface.querySelector('.target.hot')?.classList.remove('hot');
    if (hot >= 0) surface.querySelector(`.target[data-target="${hot}"]`)?.classList.add('hot');
    drag.hot = hot;
  }
});

function release(): void {
  const drag = state.drag;
  const pressed = press;
  press = undefined;
  state.drag = null;
  if (drag) {
    const target = drag.list[drag.nearest];
    if (target && !target.violation) state.tiles = target.tiles;
    else if (target?.violation) say(target.violation.message);
  } else if (pressed) {
    state.selected = pressed.index;
  }
  render();
}

surface.addEventListener('pointerup', release);
surface.addEventListener('pointercancel', () => {
  press = undefined;
  state.drag = null;
  render();
});

surface.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || state.tiles.length === 0) return;
  const order = state.tiles.map((t) => t.index);
  const at = order.indexOf(state.selected ?? -1);
  if (event.key === '[' || event.key === ']') {
    const step = event.key === ']' ? 1 : -1;
    state.selected = order[(at + step + order.length) % order.length] ?? order[0];
    render();
    return;
  }
  const tile = tileOf(state.selected);
  if (!tile) return;
  if (event.key.toLowerCase() === 'f') {
    toggleSize();
    return;
  }
  const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!step) return;
  event.preventDefault();
  const [dc, dr] = step;
  // Sideways: half a square, else a whole one, else a new column on that side.
  const wanted: [col: number, row: number, insert: boolean][] =
    dc === 0
      ? [[tile.col, tile.row + dr, false]]
      : [
          [tile.col + dc / 2, tile.row, false],
          [tile.col + dc, tile.row, false],
          [tile.col + (dc > 0 ? 1 : 0), tile.row, true],
        ];
  const list = targets(state.tiles, state.tokens, tile.index);
  let refused: string | undefined;
  for (const [col, row, insert] of wanted) {
    const target = list.find((t) => t.col === col && t.row === row && t.insert === insert);
    if (target && !target.violation) {
      state.tiles = target.tiles;
      render();
      return;
    }
    refused ??= target?.violation?.message;
  }
  say(refused ?? 'It cannot go any further that way.');
});

function toggleSize(): void {
  const tile = tileOf(state.selected);
  if (!tile || state.tokens[tile.index].kind !== 'syllable') return;
  const size = tile.size === 'flat' ? 'full' : 'flat';
  if (attempt(state.tiles.map((t) => (t === tile ? { ...t, size } : t)))) {
    // Colour was placed on the old outline and would not fit the new one.
    state.fills = state.fills.filter((f) => f.index !== tile.index);
  }
  render();
}

$('toggle-size').addEventListener('click', toggleSize);

$('suggest').addEventListener('click', () => {
  const tiles = suggest(state.tokens);
  const joined = tiles.some((t) => t.size === 'flat');
  state.tiles = tiles;
  state.fills = [];
  say(joined ? 'A starting point. Move things from here.' : 'Nothing in this text joins up by itself. Try it by hand.');
  render();
});

$('line-up').addEventListener('click', () => {
  state.tiles = lineUp(state.tokens);
  state.fills = [];
  render();
});

// ------------------------------------------------------------------- colour

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

$('palette').innerHTML = BEAD_COLOURS.map(
  ([name, hex]) =>
    `<button type="button" class="swatch" data-brush="${hex}" style="--swatch:${hex}" ` +
    `aria-label="Paint with ${name}" title="${name}" aria-pressed="false"></button>`,
).join('');

function setBrush(brush: string | null): void {
  state.brush = brush;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-brush]')) {
    button.setAttribute('aria-pressed', String(button.dataset.brush === brush));
  }
  surface.classList.toggle('painting', brush !== null);
  if (brush) say('Choose an enclosed part of a glyph to fill it. Choose the colour again to go back to moving glyphs.');
}

$('colour-tools').addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-brush]');
  if (!button) return;
  const brush = button.dataset.brush!;
  setBrush(state.brush === brush ? null : brush);
});

const customColour = $<HTMLInputElement>('custom-colour');
customColour.addEventListener('input', () => setBrush(customColour.value));

$('clear-colours').addEventListener('click', () => {
  state.fills = [];
  render();
});

surface.addEventListener('click', (event) => {
  const at = toBoard(event);
  if (!state.brush || !at || !view) return;
  const { lay, painted } = view;
  if (painted) {
    const [px, py] = toPixel(at.x, at.y, UNIT, painted.scale);
    const owner = painted.owner[py * painted.width + px];
    if (owner > 0) state.fills.splice(owner - 1, 1);
  }
  if (state.brush === 'erase') return render();
  const glyph = glyphAt(lay, at.x, at.y, SIDE);
  if (!glyph) return say('Choose a spot inside a glyph to colour it.');
  const fill: Fill = {
    index: glyph.index,
    x: (at.x - glyph.at.x) / UNIT,
    y: (at.y - glyph.at.y) / UNIT,
    color: state.brush,
  };
  state.fills.push(fill);
  render();
  if (!state.fills.includes(fill)) say('That spot is on a line or outside the glyph, so nothing was filled.');
});

// --------------------------------------------------------------------- text

const textBox = $<HTMLTextAreaElement>('latin');

function readText(): void {
  state.text = textBox.value;
  const result = transcribeZulu(state.text.replace(/\n/g, ' '));
  state.tokens = result.tokens;
  state.unread = result.unread;
  state.tiles = lineUp(result.tokens);
  state.fills = [];
  state.selected = null;
}

textBox.value = state.text;
textBox.addEventListener('input', () => {
  readText();
  render();
});

// ------------------------------------------------------------------- export

const EXPORT_UNIT = 4;

function exportSvg(scale = 1): string | undefined {
  if (state.tiles.length === 0) {
    say('Nothing to save yet.');
    return undefined;
  }
  const lay = boardLayout(state.tiles, state.tokens, EXPORT_UNIT, 0.5);
  const pad = svgPadding(EXPORT_UNIT);
  const painted = paintFills(lay, [...state.fills], EXPORT_UNIT, 4);
  const underlay = painted
    ? `<image href="${painted.canvas.toDataURL('image/png')}" x="${-pad}" y="0" ` +
      `width="${lay.width + pad * 2}" height="${lay.height + pad}"/>`
    : undefined;
  return renderSvg(lay, {
    unit: EXPORT_UNIT,
    title: reading(state.tokens).trim(),
    color: '#000',
    scale,
    underlay,
  });
}

function download(blob: Blob, extension: string): void {
  const name =
    reading(state.tokens)
      .normalize('NFC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'isibheqe';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${name}.${extension}`;
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

// --------------------------------------------------------------------- boot

readText();
render();
