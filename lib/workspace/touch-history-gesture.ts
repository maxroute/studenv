// ---------------------------------------------------------------------------
// Multi-finger tap gestures for undo / redo on touch screens
// ---------------------------------------------------------------------------
// Two-finger tap = undo, three-finger tap = redo (as in drawing apps). A tap
// only counts when every finger lifts quickly and none moved, so two-finger
// pan / pinch, long presses and pen or mouse input never trigger it.
// Pure state machine: fed with pointer events, returns the action on the
// last finger's release.
// ---------------------------------------------------------------------------

/** All fingers must be down and lifted within this time (ms). */
export const TOUCH_TAP_MAX_DURATION_MS = 250;
/** A finger moving further than this (screen px) turns the tap into a pan/pinch. */
export const TOUCH_TAP_MAX_MOVE_PX = 10;

export type TouchHistoryAction = "undo" | "redo";

type Finger = { x: number; y: number };

export class TouchHistoryGesture {
  private fingers = new Map<number, Finger>();
  private startedAt = 0;
  private maxFingers = 0;
  private cancelled = false;

  /** A pointer went down. Non-touch input cancels any gesture in progress. */
  down(pointerId: number, pointerType: string, x: number, y: number, time: number) {
    if (pointerType !== "touch") {
      this.cancelled = true;
      return;
    }
    if (this.fingers.size === 0) {
      this.startedAt = time;
      this.maxFingers = 0;
      this.cancelled = false;
    }
    this.fingers.set(pointerId, { x, y });
    this.maxFingers = Math.max(this.maxFingers, this.fingers.size);
    if (time - this.startedAt > TOUCH_TAP_MAX_DURATION_MS) this.cancelled = true;
  }

  move(pointerId: number, x: number, y: number) {
    const finger = this.fingers.get(pointerId);
    if (finger && Math.hypot(x - finger.x, y - finger.y) > TOUCH_TAP_MAX_MOVE_PX) this.cancelled = true;
  }

  /** A finger lifted; returns the action once the last finger is up. */
  up(pointerId: number, time: number): TouchHistoryAction | null {
    if (!this.fingers.delete(pointerId) || this.fingers.size > 0) return null;
    const quick = time - this.startedAt <= TOUCH_TAP_MAX_DURATION_MS;
    const action = this.cancelled || !quick ? null : this.maxFingers === 2 ? "undo" : this.maxFingers === 3 ? "redo" : null;
    this.cancelled = false;
    this.maxFingers = 0;
    return action;
  }

  /** The browser or OS took the pointer (pointercancel): no gesture. */
  cancel(pointerId: number) {
    this.cancelled = true;
    this.fingers.delete(pointerId);
  }
}
