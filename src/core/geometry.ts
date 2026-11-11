/**
 * Proportions of the isiBheqe soHlamvu syllable block, in abstract units.
 * These values come from Baruch Lubinsky's 2015 implementation of the
 * "Isibheqe Sohlamvu keyboard specifications" (23 July 2015) and must not
 * change: they define the designed forms.
 */
export const BASE = 16;
export const HEIGHT = 13.8;
export const TONE = HEIGHT / 3.5;

export interface Point {
  x: number;
  y: number;
}

export const pt = (x: number, y: number): Point => ({ x, y });
export const add = (a: Point, b: Point): Point => pt(a.x + b.x, a.y + b.y);
export const sub = (a: Point, b: Point): Point => pt(a.x - b.x, a.y - b.y);
export const scale = (a: Point, m: number): Point => pt(a.x * m, a.y * m);
export const mid = (a: Point, b: Point): Point => pt((a.x + b.x) / 2, (a.y + b.y) / 2);

/**
 * Drawing primitives. Angles follow the HTML canvas convention (radians,
 * y pointing down); an arc runs anticlockwise from `start` to `end`.
 */
export type Stroke = (
  | { kind: 'line'; a: Point; b: Point }
  | { kind: 'arc'; c: Point; r: number; start: number; end: number }
  | { kind: 'circle'; c: Point; r: number }
  | { kind: 'dot'; c: Point; r: number }
) & {
  /** The vowel or consonant mark this stroke belongs to. */
  by?: string;
};

/** The triangle a glyph is built on. `open` means the base side is not drawn. */
export interface Frame {
  origin: Point;
  apex: Point;
  base: Point;
  open: boolean;
}
