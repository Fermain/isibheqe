/**
 * Page ornament. Two bands, one for each of the script's names, both newly drawn
 * for this site rather than copied from any piece of beadwork or any wall.
 *
 * The bead band (isiBheqe) is two rows of the script's own triangle, on the
 * proportions in core/geometry. Rows that mirror each other make the diamond and
 * the hourglass, two of the four older symbols the project's booklet opens with.
 *
 * The engraved band (Ditema) is one square cell of combed arcs, mirrored to fill
 * the strip.
 *
 * Colours come from the page's CSS tokens, so both bands follow the theme.
 */
import { BASE, HEIGHT } from './core/geometry';

const n = (value: number) => +value.toFixed(2);

/** Diamond colours, left to right, as CSS custom properties. */
const BEADS = ['--red', '--sun', '--blue', '--sun'];

export function beadBand(size = 30): string {
  const s = size;
  const h = (size * HEIGHT) / BASE;
  const width = s * BEADS.length;
  const diamond = (cx: number, k: number) =>
    `M${n(cx - (s / 2) * k)} ${n(h)}L${n(cx)} ${n(h - h * k)}L${n(cx + (s / 2) * k)} ${n(h)}L${n(cx)} ${n(h + h * k)}Z`;
  const tile = BEADS.map((colour, i) => {
    const cx = s * i + s / 2;
    return (
      `<path d="${diamond(cx, 0.86)}" fill="var(${colour})"/>` +
      `<path d="${diamond(cx, 0.3)}" fill="var(--ink)"/>`
    );
  }).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${n(h * 2)}" aria-hidden="true">` +
    `<defs><pattern id="bead-band" width="${n(width)}" height="${n(h * 2)}" patternUnits="userSpaceOnUse">` +
    `<rect width="${n(width)}" height="${n(h * 2)}" fill="var(--ink)"/>${tile}</pattern></defs>` +
    `<rect width="100%" height="100%" fill="url(#bead-band)"/></svg>`
  );
}

export function engravedBand(cell = 24): string {
  const c = cell;
  const circle = (cx: number, cy: number, r: number) =>
    `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0`;
  let d = '';
  // Arcs combed outward from the middle of the mirrored cell…
  for (let k = 1; k <= 5; k++) d += circle(c, c, (c * k) / 5);
  // …and from its corners, which meet their mirror images in the next cell.
  for (const [x, y] of [[0, 0], [2 * c, 0], [0, 2 * c], [2 * c, 2 * c]]) {
    for (let k = 1; k <= 2; k++) d += circle(x, y, (c * k) / 5);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${c * 2}" aria-hidden="true">` +
    `<defs><pattern id="engraved-band" width="${c * 2}" height="${c * 2}" patternUnits="userSpaceOnUse">` +
    `<path d="${d}" fill="none" stroke="var(--groove)" stroke-width="1.25"/></pattern></defs>` +
    `<rect width="100%" height="100%" fill="url(#engraved-band)"/></svg>`
  );
}
