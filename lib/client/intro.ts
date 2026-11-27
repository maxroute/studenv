/**
 * The yellow opening screen. Its motion follows the studio's reference
 * animation (studenv-v3.html), counted in frames at 60 a second: the mark
 * shrinks into place, the words roll over, and it all folds into the app's
 * logo. The mark itself draws the way it does in the app's loaders.
 */

/** A session cookie: the intro plays once, not on every page or reload. */
export const INTRO_COOKIE = "studenv-intro";

export const INTRO_FPS = 60;
/** The screen has reached the app's logo by this frame. */
export const INTRO_END_FRAME = 228;
/** With reduced motion, the finished picture is held still on this frame. */
export const INTRO_STILL_FRAME = 165;

export const INTRO_WORDS = ["Capture", "Organize", "Grow", "Studenv"];

const clamp = (t: number) => Math.max(0, Math.min(1, t));
/** How far `u` has got from `a` to `b`, from 0 to 1. */
const segment = (u: number, a: number, b: number) => clamp((u - a) / (b - a));
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

  return {
    logo: { x, y, size },
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
