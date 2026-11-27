/**
 * Makes the loader's arrowheads ride the tips of the arms while they draw. The
 * styles stay plain CSS (so the loader moves before any script runs); this works
 * out their keyframes from the arm's own curve, and a test keeps the two in step.
 */

type Point = { x: number; y: number };
type Curve = [Point, Point, Point, Point];

/** The top arm: from beside the dot, up and over to its head. */
export const TOP_ARM = "M111.5 142.5C84.4 133.7 76 98.2 94.4 74.6C107.6 57.6 128.6 51.6 151 54";
/** The mark's centre: the bottom arm is the top one turned half way round it. */
const CENTRE = 141;
/** The arm finishes drawing this far (%) into the loader's cycle. */
export const DRAWN_AT = 40;
/** The heads have faded in by this point (%). */
const SHOWN_AT = 6;
const STEP = 2;
const SLICES = 400;

/** Reads an "M x y C … C …" path into its cubic curves. */
export function readCurves(path: string): Curve[] {
  const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const points = Array.from({ length: numbers.length / 2 }, (_, i) => ({ x: numbers[i * 2], y: numbers[i * 2 + 1] }));
  const curves: Curve[] = [];
  for (let i = 0; i + 3 < points.length; i += 3) curves.push([points[i], points[i + 1], points[i + 2], points[i + 3]]);
  return curves;
}

const mix = (a: number, b: number, c: number, d: number, t: number) =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
const onCurve = ([a, b, c, d]: Curve, t: number): Point => ({ x: mix(a.x, b.x, c.x, d.x, t), y: mix(a.y, b.y, c.y, d.y, t) });

/** The point a share of the way along the path, and the way it is heading there (degrees). */
export function alongPath(path: string, share: number): Point & { angle: number } {
  const points = readCurves(path).flatMap((curve, index) =>
    Array.from({ length: SLICES + 1 }, (_, i) => onCurve(curve, i / SLICES)).slice(index ? 1 : 0),
  );
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const wanted = Math.max(0, Math.min(1, share)) * lengths[lengths.length - 1];
  let i = 1;
  while (i < points.length - 1 && lengths[i] < wanted) i++;
  const before = points[i - 1];
  const after = points[i];
  const t = (wanted - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
  return {
    x: before.x + (after.x - before.x) * t,
    y: before.y + (after.y - before.y) * t,
    angle: (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI,
  };
}

/** CSS's "ease-in-out", the pace at which the arm itself draws. */
export function easeInOutCss(time: number): number {
  const bezier = (a: number, b: number, s: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (bezier(0.42, 0.58, middle) < time) low = middle;
    else high = middle;
  }
  return bezier(0, 1, (low + high) / 2);
}

const round = (value: number) => Number(value.toFixed(2)) || 0;

/**
 * The keyframes that carry one head. Its drawing is where it comes to rest, so
 * each step moves that resting place back to the arm's tip and turns it to face
 * the way the arm is heading. The last step leaves it untouched.
 */
export function leadKeyframes(name: string, turned: boolean): string {
  const rest = alongPath(TOP_ARM, 1);
  const flip = (point: Point): Point => (turned ? { x: CENTRE * 2 - point.x, y: CENTRE * 2 - point.y } : point);
  const end = flip(rest);
  const lines: string[] = [];
  for (let at = 0; at <= DRAWN_AT; at += STEP) {
    const tip = alongPath(TOP_ARM, easeInOutCss(at / DRAWN_AT));
    const here = flip(tip);
    // Kept within half a turn of the resting angle, so it never spins the long way.
    const turn = ((((tip.angle - rest.angle) % 360) + 540) % 360) - 180;
    const transform = `translate(${round(here.x)}px, ${round(here.y)}px) rotate(${round(turn)}deg) translate(${round(-end.x)}px, ${round(-end.y)}px)`;
    const opacity = at === 0 ? "opacity: 0; " : at === SHOWN_AT || at === DRAWN_AT ? "opacity: 1; " : "";
    lines.push(`  ${at === DRAWN_AT ? `${at}%, 100%` : `${at}%`} { ${opacity}transform: ${transform}; }`);
  }
  return `@keyframes ${name} {\n${lines.join("\n")}\n}`;
}
