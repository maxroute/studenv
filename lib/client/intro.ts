/**
 * The yellow opening screen. Its motion follows the studio's reference
 * animation (studenv-v3.html), counted in frames at 60 a second: a black circle
 * shrinks to the mark's centre dot, the arms then draw as they do in the app's
 * loaders, the words roll over, and it all folds into the app's logo.
 */

export const INTRO_FPS = 60;
/** The screen has reached the app's logo by this frame. */
export const INTRO_END_FRAME = 228;
/** With reduced motion, the finished picture is held still on this frame. */
export const INTRO_STILL_FRAME = 165;
/** The arms begin to draw here, once the black circle has become the dot. */
export const INTRO_ARMS_FRAME = 64;
/** The last frame before the text fades: it waits here for the screen's data. */
export const INTRO_HOLD_FRAME = 170;
/** A slow connection never holds the student there longer than this. */
export const INTRO_MAX_HOLD_MS = 4_000;

/** The mark's centre dot, as a radius on the mark's own grid, and that grid's width. */
const DOT_RADIUS = 17;
const MARK_GRID = 242;
/** How far past the farthest corner the black circle starts, so no edge shows at first. */
const OVERSHOOT = 1.04;

export const INTRO_WORDS = ["Capture", "Organize", "Grow", "Studenv"];

const clamp = (t: number) => Math.max(0, Math.min(1, t));
/** How far `u` has got from `a` to `b`, from 0 to 1. */
const segment = (u: number, a: number, b: number) => clamp((u - a) / (b - a));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The value at frame `f`, moving through `values` at `frames`. */
function keyframes(f: number, frames: number[], values: number[], ease: (t: number) => number = (t) => t): number {
  if (f <= frames[0]) return values[0];
  for (let i = 0; i < frames.length - 1; i++) {
    if (f <= frames[i + 1]) {
      const t = (f - frames[i]) / (frames[i + 1] - frames[i]);
      return values[i] + (values[i + 1] - values[i]) * ease(t);
    }
  }
  return values[values.length - 1];
}

type Box = { left: number; top: number; width: number; height: number };
export type Circle = { x: number; y: number; size: number };

/** The yellow disc's size within the square image of the app's logo. */
const DISC_SHARE = 0.97;

/** Where the intro ends: the disc of the logo at `box`. */
export function logoDisc(box: Box): Circle {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, size: box.width * DISC_SHARE };
}

/** The next frame to show: it goes past the hold only once it may leave. */
export function nextFrame(frame: number, elapsedMs: number, mayLeave: boolean): number {
  const limit = mayLeave || frame > INTRO_HOLD_FRAME ? INTRO_END_FRAME : INTRO_HOLD_FRAME;
  return Math.min(limit, frame + (elapsedMs * INTRO_FPS) / 1000);
}

/**
 * Everything on screen at frame `f`. `target` is the app's logo; without one on
 * screen the intro closes to nothing in the middle.
 */
export function introFrame(f: number, width: number, height: number, target: Circle | null) {
  const diagonal = Math.hypot(width, height);
  const restingSize = Math.min(width * 0.7, height * 0.36, 320);
  const middle = { x: width / 2, y: height * 0.4 };
  const end = target ?? { ...middle, size: 0 };

  const zoom = keyframes(f, [8, 76], [1, 0], easeInOutCubic);
  const fold = keyframes(f, [180, 226], [0, 1], easeInOutCubic);
  const zoomed = restingSize + (diagonal * 1.05 - restingSize) * zoom;
  // Mixed this way, a finished fold is exactly the target, with no rounding left over.
  const folded = (from: number, to: number) => from * (1 - fold) + to * fold;
  const size = folded(zoomed, end.size);
  const x = folded(middle.x, end.x);
  const y = folded(middle.y, end.y);
  const counted = keyframes(f, [0, 165], [0, 1], easeInOutCubic);

  // The black circle starts beyond the window, so its edge comes in from outside.
  const farthestCorner = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  const covering = size > 0 ? (farthestCorner * OVERSHOOT * MARK_GRID) / size : DOT_RADIUS;
  const closing = 1 - easeInOut(segment(f, 4, 60));

  return {
    logo: { x, y, size },
    /** The black circle, on the mark's grid: the whole window at first, then only the centre dot. */
    dotRadius: DOT_RADIUS + (covering - DOT_RADIUS) * closing,
    armsStarted: f >= INTRO_ARMS_FRAME,
    /** The yellow covers the whole window until it folds. */
    fieldRadius: folded(diagonal, size / 2),
    wordsTop: middle.y + restingSize / 2 + 28,
    /** How many words have rolled past. */
    wordShift: keyframes(f, [96, 110, 122, 136, 148, 162], [0, 1, 1, 2, 2, 3], easeInOutCubic),
    textOpacity: 1 - segment(f, 172, 190),
    progress: counted,
    finished: f >= INTRO_END_FRAME,
  };
}
