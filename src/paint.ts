/**
 * Colour, for art's sake: a paint bucket that fills any enclosed region of a
 * glyph. Colour carries no sound here; it is decoration, as in the beadwork
 * and murals the script grew from.
 *
 * Fills are remembered as a point inside a glyph (in glyph units), so they
 * survive re-wrapping and resizing. Regions are found by flood fill on a
 * raster of the strokes, which keeps the glyph geometry itself untouched.
 */
import { svgPadding } from './core/svg';
import { strokeWidth, type Layout, type Placed } from './core/text';

export interface Fill {
  /** Index of the token whose glyph holds the fill. */
  index: number;
  /** Point inside the region, relative to the glyph's cell, in units. */
  x: number;
  y: number;
  /** #rrggbb */
  color: string;
}

export interface Painted {
  canvas: HTMLCanvasElement;
  /** For each pixel, 1 + the index of the fill that owns it, or 0. */
  owner: Int16Array;
  width: number;
  height: number;
  scale: number;
  /** Fills that found no closed region (they would have spilled out). */
  spilled: number[];
}

const WALL_ALPHA = 48;

function drawWalls(ctx: CanvasRenderingContext2D, glyph: Placed): void {
  for (const s of glyph.strokes) {
    ctx.beginPath();
    if (s.kind === 'line') {
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.stroke();
    } else if (s.kind === 'arc') {
      ctx.arc(s.c.x, s.c.y, s.r, s.start, s.end, true);
      ctx.stroke();
    } else {
      ctx.arc(s.c.x, s.c.y, s.r, 0, Math.PI * 2);
      if (s.kind === 'dot') ctx.fill();
      else ctx.stroke();
    }
  }
  // An open vowel (a chevron) still encloses its triangle for painting.
  if (glyph.frame.open) {
    ctx.beginPath();
    ctx.moveTo(glyph.frame.origin.x, glyph.frame.origin.y);
    ctx.lineTo(glyph.frame.base.x, glyph.frame.base.y);
    ctx.stroke();
  }
}

/** Convert a point in layout coordinates to a pixel of the painted canvas. */
export function toPixel(x: number, y: number, unit: number, scale: number): [number, number] {
  return [Math.round((x + svgPadding(unit)) * scale), Math.round(y * scale)];
}

/** Render the colour layer for a layout. */
export function paint(layout: Layout, fills: readonly Fill[], unit: number, scale: number): Painted {
  const pad = svgPadding(unit);
  const width = Math.ceil((layout.width + pad * 2) * scale);
  const height = Math.ceil((layout.height + pad) * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  ctx.setTransform(scale, 0, 0, scale, pad * scale, 0);
  ctx.lineWidth = Math.max(strokeWidth(unit), 2 / scale);
  ctx.lineCap = 'round';
  for (const glyph of layout.glyphs) drawWalls(ctx, glyph);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const walls = ctx.getImageData(0, 0, width, height).data;
  const isWall = (p: number) => walls[p * 4 + 3] > WALL_ALPHA;
  const owner = new Int16Array(width * height);
  const spilled: number[] = [];

  fills.forEach((fill, i) => {
    const glyph = layout.glyphs.find((g) => g.index === fill.index);
    if (!glyph) return void spilled.push(i);
    const [sx, sy] = toPixel(glyph.at.x + fill.x * unit, glyph.at.y + fill.y * unit, unit, scale);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return void spilled.push(i);
    const start = sy * width + sx;
    if (isWall(start) || owner[start] !== 0) return void spilled.push(i);

    const id = i + 1;
    const region: number[] = [];
    const stack = [start];
    owner[start] = id;
    let open = false;
    while (stack.length > 0) {
      const p = stack.pop()!;
      region.push(p);
      const x = p % width;
      const y = (p - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        open = true;
        break;
      }
      for (const q of [p - 1, p + 1, p - width, p + width]) {
        if (owner[q] === 0 && !isWall(q)) {
          owner[q] = id;
          stack.push(q);
        }
      }
    }
    if (open) {
      // Reached the edge of the sheet: not an enclosed region. Undo it.
      for (const p of region) owner[p] = 0;
      for (const p of stack) owner[p] = 0;
      spilled.push(i);
    }
  });

  // Grow each region under the strokes so no pale seam shows beside a line.
  for (let pass = 0; pass < 3; pass++) {
    const before = owner.slice();
    for (let p = width; p < before.length - width; p++) {
      if (before[p] !== 0 || !isWall(p)) continue;
      owner[p] = before[p - 1] || before[p + 1] || before[p - width] || before[p + width];
    }
  }

  const image = ctx.createImageData(width, height);
  const rgb = fills.map((f) => [1, 3, 5].map((at) => parseInt(f.color.slice(at, at + 2), 16)));
  for (let p = 0; p < owner.length; p++) {
    if (owner[p] === 0) continue;
    const [r, g, b] = rgb[owner[p] - 1];
    image.data[p * 4] = r;
    image.data[p * 4 + 1] = g;
    image.data[p * 4 + 2] = b;
    image.data[p * 4 + 3] = 255;
  }
  ctx.clearRect(0, 0, width, height);
  ctx.putImageData(image, 0, 0);

  return { canvas, owner, width, height, scale, spilled };
}

/** The glyph whose cell contains a point in layout coordinates, if any. */
export function glyphAt(layout: Layout, x: number, y: number, rowStep: number): Placed | undefined {
  return layout.glyphs.find(
    (g) => x >= g.at.x && x < g.at.x + g.advance && y >= g.at.y && y < g.at.y + rowStep,
  );
}
