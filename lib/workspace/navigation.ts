// ---------------------------------------------------------------------------
// Canvas navigation: pure rules for wheel, pinch, glide and edge scrolling
// ---------------------------------------------------------------------------
// Behaviour follows tldraw and Excalidraw:
// - the wheel and trackpad scroll pan; Shift pans sideways; Ctrl/⌘ (which
//   is also how a trackpad pinch arrives) zooms around the pointer
// - two fingers pan and pinch in every tool, anchored at their midpoint
// - a fast hand pan keeps gliding briefly after release (tldraw)
// - dragging a selection box near the edge scrolls the view (tldraw)
// No React or DOM here, so every rule is unit tested.
// ---------------------------------------------------------------------------

export type Point = { x: number; y: number };
/** Camera: screen position of world (0, 0) and the zoom. */
export type Camera = { x: number; y: number; scale: number };

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 5;

export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** One mouse-wheel notch (±100) zooms about 26%; trackpad pinches (small deltas) zoom smoothly. */
const ZOOM_DELTA_PER_DOUBLING = 300;
const MAX_ZOOM_DELTA = 100;

const LINE_HEIGHT_PX = 16;

export type WheelInput = {
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages (WheelEvent.deltaMode). */
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
};

export type WheelAction = { type: "pan"; dx: number; dy: number } | { type: "zoom"; factor: number } | { type: "none" };

/** What one wheel event does: pan by (dx, dy) screen px, or zoom by a factor around the pointer. */
export function wheelAction(input: WheelInput, pageHeight = 800): WheelAction {
  const unit = input.deltaMode === 1 ? LINE_HEIGHT_PX : input.deltaMode === 2 ? pageHeight : 1;
  const deltaX = input.deltaX * unit;
  const deltaY = input.deltaY * unit;
  if (!deltaX && !deltaY) return { type: "none" };
  if (input.ctrlKey || input.metaKey) {
    const delta = Math.max(-MAX_ZOOM_DELTA, Math.min(MAX_ZOOM_DELTA, deltaY || deltaX));
    return { type: "zoom", factor: Math.pow(2, -delta / ZOOM_DELTA_PER_DOUBLING) };
  }
  // Shift turns a vertical wheel into a sideways pan (macOS may already send deltaX).
  if (input.shiftKey && !deltaX) return { type: "pan", dx: deltaY, dy: 0 };
  return { type: "pan", dx: deltaX, dy: deltaY };
}

/** The camera after panning by a screen delta (content moves opposite to the scroll). */
export function panCamera(camera: Camera, dx: number, dy: number): Camera {
  return { x: camera.x - dx, y: camera.y - dy, scale: camera.scale };
}

/** The camera after zooming to `scale` while keeping the world point under `anchor` (canvas px) fixed. */
export function zoomCameraAt(camera: Camera, anchor: Point, scale: number): Camera {
  const next = clampScale(scale);
  const worldX = (anchor.x - camera.x) / camera.scale;
  const worldY = (anchor.y - camera.y) / camera.scale;
  return { x: anchor.x - worldX * next, y: anchor.y - worldY * next, scale: next };
}

/**
 * Two fingers: the world point under their first midpoint follows their
 * current midpoint, and the zoom follows their spread. Points are canvas px.
 */
export function pinchCamera(start: { camera: Camera; a: Point; b: Point }, a: Point, b: Point): Camera {
  const startMid = { x: (start.a.x + start.b.x) / 2, y: (start.a.y + start.b.y) / 2 };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const startSpread = Math.max(1, Math.hypot(start.b.x - start.a.x, start.b.y - start.a.y));
  const spread = Math.hypot(b.x - a.x, b.y - a.y);
  const scale = clampScale(start.camera.scale * (spread / startSpread));
  const worldX = (startMid.x - start.camera.x) / start.camera.scale;
  const worldY = (startMid.y - start.camera.y) / start.camera.scale;
  return { x: mid.x - worldX * scale, y: mid.y - worldY * scale, scale };
}

// ── glide after a fast pan ─────────────────────────────────────────────────

const VELOCITY_WINDOW_MS = 100;
/** Below this speed (px/ms) a release does not glide. */
export const GLIDE_MIN_SPEED = 0.1;
/** Fastest glide (px/ms), as in tldraw. */
const GLIDE_MAX_SPEED = 2;
/** Speed kept per 16 ms frame. */
const GLIDE_FRICTION = 0.9;

/** Pointer samples during a pan; the velocity at release decides the glide. */
export class PanVelocity {
  private samples: Array<{ t: number; x: number; y: number }> = [];

  add(t: number, x: number, y: number) {
    this.samples.push({ t, x, y });
    while (this.samples.length > 2 && t - this.samples[0].t > VELOCITY_WINDOW_MS) this.samples.shift();
  }

  /** Velocity in px/ms over the last ~100 ms, capped; zero when the pointer had stopped. */
  velocity(now: number): Point {
    const last = this.samples.at(-1);
    const first = this.samples[0];
    if (!last || !first || last === first || now - last.t > VELOCITY_WINDOW_MS) return { x: 0, y: 0 };
    const dt = Math.max(1, last.t - first.t);
    let vx = (last.x - first.x) / dt;
    let vy = (last.y - first.y) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed > GLIDE_MAX_SPEED) {
      vx = (vx / speed) * GLIDE_MAX_SPEED;
      vy = (vy / speed) * GLIDE_MAX_SPEED;
    }
    return { x: vx, y: vy };
  }
}

/** One frame of glide: how far to move (px) and the velocity left, or null when it has stopped. */
export function glideStep(velocity: Point, dtMs: number): { dx: number; dy: number; velocity: Point } | null {
  if (Math.hypot(velocity.x, velocity.y) < GLIDE_MIN_SPEED / 4) return null;
  const decay = Math.pow(GLIDE_FRICTION, dtMs / 16);
  return { dx: velocity.x * dtMs, dy: velocity.y * dtMs, velocity: { x: velocity.x * decay, y: velocity.y * decay } };
}

// ── edge scrolling ─────────────────────────────────────────────────────────

/** Pointer distance from the edge where scrolling starts (px). */
export const EDGE_SCROLL_MARGIN = 40;
/** Fastest edge scroll (px per 16 ms frame), reached at the edge itself. */
const EDGE_SCROLL_MAX = 14;

/**
 * How far the content should move this frame (screen px; the camera moves
 * opposite) when the pointer is near the canvas edge while selecting.
 */
export function edgeScrollDelta(pointer: Point, rect: { width: number; height: number }, dtMs = 16): Point {
  const axis = (position: number, size: number) => {
    if (position < EDGE_SCROLL_MARGIN) return -Math.min(1, (EDGE_SCROLL_MARGIN - position) / EDGE_SCROLL_MARGIN);
    if (position > size - EDGE_SCROLL_MARGIN) return Math.min(1, (position - (size - EDGE_SCROLL_MARGIN)) / EDGE_SCROLL_MARGIN);
    return 0;
  };
  const scale = (EDGE_SCROLL_MAX * dtMs) / 16;
  return { x: axis(pointer.x, rect.width) * scale, y: axis(pointer.y, rect.height) * scale };
}

// ── right-button drag ──────────────────────────────────────────────────────

/** A right-button press becomes a pan once it travels this far (px); a still press opens the menu. */
export const RIGHT_DRAG_PAN_THRESHOLD = 5;

// ── hand tool clicks ───────────────────────────────────────────────────────

/** Double-click zooms in, triple-click out, quadruple-click resets (tldraw). */
export function handClickZoom(clicks: number, scale: number): { type: "zoom"; scale: number } | { type: "reset" } | null {
  if (clicks === 2) return { type: "zoom", scale: clampScale(scale * 2) };
  if (clicks === 3) return { type: "zoom", scale: clampScale(scale / 2) };
  if (clicks >= 4) return { type: "reset" };
  return null;
}
