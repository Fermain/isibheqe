/** Turn strokes into SVG markup. Pure string building, no DOM needed. */
import { TONE, type Stroke } from './geometry';
import { rowHeight, strokeWidth, type Layout, type Placed } from './text';

const n = (v: number) => String(Math.round(v * 100) / 100);
const TAU = Math.PI * 2;

const circlePath = (cx: number, cy: number, r: number) =>
  `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;

/** Path data for the outlined strokes and for the filled dots of one glyph. */
export function strokePaths(strokes: readonly Stroke[]): { outline: string; fill: string } {
  let outline = '';
  let fill = '';
  for (const s of strokes) {
    switch (s.kind) {
      case 'line':
        outline += `M${n(s.a.x)} ${n(s.a.y)}L${n(s.b.x)} ${n(s.b.y)}`;
        break;
      case 'circle':
        outline += circlePath(s.c.x, s.c.y, s.r);
        break;
      case 'dot':
        fill += circlePath(s.c.x, s.c.y, s.r);
        break;
      case 'arc': {
        // Canvas "anticlockwise" arcs sweep with decreasing angle.
        const sweep = (((s.start - s.end) % TAU) + TAU) % TAU;
        const from = { x: s.c.x + s.r * Math.cos(s.start), y: s.c.y + s.r * Math.sin(s.start) };
        const to = { x: s.c.x + s.r * Math.cos(s.end), y: s.c.y + s.r * Math.sin(s.end) };
        outline += `M${n(from.x)} ${n(from.y)}A${n(s.r)} ${n(s.r)} 0 ${sweep > Math.PI ? 1 : 0} 0 ${n(to.x)} ${n(to.y)}`;
        break;
      }
    }
  }
  return { outline, fill };
}

const escapeXml = (s: string) =>
  s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** One glyph's strokes, one path per mark so a page can highlight each mark. */
function glyphPaths(strokes: readonly Stroke[], color: string): string {
  const byMark = new Map<string, Stroke[]>();
  for (const s of strokes) {
    const key = s.by ?? '';
    byMark.set(key, [...(byMark.get(key) ?? []), s]);
  }
  let out = '';
  for (const [mark, list] of byMark) {
    const attr = mark ? ` data-by="${escapeXml(mark)}"` : '';
    const { outline, fill } = strokePaths(list);
    if (outline) out += `<path${attr} d="${outline}"/>`;
    if (fill) out += `<path${attr} d="${fill}" fill="${color}" stroke="none"/>`;
  }
  return out;
}

/**
 * The construction frame from the 2015 specification sheet: a box around the
 * triangle with rules at the apex and the base and a dashed centre line.
 */
function guidePaths(glyph: Placed, unit: number): string {
  const { origin, apex, base } = glyph.frame;
  const xs = [origin.x, apex.x, base.x];
  const ys = [origin.y, apex.y, base.y];
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const margin = TONE * unit;
  const upright = origin.y === base.y;
  let rules: string;
  let centre: string;
  if (upright) {
    rules = `M${n(x0)} ${n(y0)}H${n(x1)}M${n(x0)} ${n(y1)}H${n(x1)}`;
    centre = `M${n(x0)} ${n((y0 + y1) / 2)}H${n(x1)}`;
    y0 -= margin;
    y1 += margin;
  } else {
    rules = `M${n(x0)} ${n(y0)}V${n(y1)}M${n(x1)} ${n(y0)}V${n(y1)}`;
    centre = `M${n((x0 + x1) / 2)} ${n(y0)}V${n(y1)}`;
    x0 -= margin;
    x1 += margin;
  }
  const box = `M${n(x0)} ${n(y0)}H${n(x1)}V${n(y1)}H${n(x0)}Z`;
  return (
    `<g class="guides" stroke-width="${n(unit / 10)}" stroke-opacity="0.45">` +
    `<path d="${box}${rules}"/>` +
    `<path d="${centre}" stroke-dasharray="${n(unit * 0.6)} ${n(unit * 0.6)}"/></g>`
  );
}

export interface SvgOptions {
  unit: number;
  /** Accessible name: what the glyphs say, in Latin letters. */
  title?: string;
  /** Stroke colour. Defaults to currentColor so the page can theme it. */
  color?: string;
  /** Extra attributes for each glyph group, e.g. to make them interactive. */
  glyphAttrs?: (tokenIndex: number) => string;
  /** Scale factor for the width/height attributes (the viewBox is untouched). */
  scale?: number;
  /** Draw the specification's construction frame behind each glyph. */
  guides?: boolean;
  /** A reading to print under each glyph. Lay the text out with `gloss` on. */
  labels?: (tokenIndex: number) => string | undefined;
  /** Raw SVG drawn beneath the glyphs, e.g. a colour layer. */
  underlay?: string;
}

/** Blank space around the glyphs in the rendered SVG. */
export const svgPadding = (unit: number) => unit * 3;

/** A complete, standalone SVG document for a laid-out text. */
export function renderSvg(layout: Layout, options: SvgOptions): string {
  const { unit, title, color = 'currentColor', glyphAttrs, scale = 1 } = options;
  const pad = svgPadding(unit);
  const w = layout.width + pad * 2;
  const h = layout.height + pad;
  const body = layout.glyphs
    .map((g) => {
      const attrs = glyphAttrs ? ` ${glyphAttrs(g.index)}` : '';
      const label = options.labels?.(g.index);
      return (
        `<g${attrs}>` +
        (options.guides ? guidePaths(g, unit) : '') +
        glyphPaths(g.strokes, color) +
        (label
          ? `<text class="gloss" x="${n(g.at.x + g.advance / 2)}" y="${n(g.at.y + rowHeight(unit) + unit * 3.5)}" ` +
            `text-anchor="middle" font-size="${n(unit * 3.6)}" fill="${color}" stroke="none">${escapeXml(label)}</text>`
          : '') +
        `</g>`
      );
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(-pad)} 0 ${n(w)} ${n(h)}" ` +
    `width="${n(w * scale)}" height="${n(h * scale)}" role="img" fill="none" stroke="${color}" ` +
    `stroke-width="${n(strokeWidth(unit))}" stroke-linecap="round" stroke-linejoin="round">` +
    (title ? `<title>${escapeXml(title)}</title>` : '') +
    (options.underlay ?? '') +
    body +
    `</svg>`
  );
}
