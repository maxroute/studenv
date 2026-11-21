// ---------------------------------------------------------------------------
// Palm rejection for the board's on-screen buttons (pure)
// ---------------------------------------------------------------------------
//
// With a pen in hand, the side of the palm often rests on the screen, and the
// buttons in the corner (undo, zoom) sit right where it lands. While the pen
// is down or hovering, and for a moment after, touches on those buttons are
// ignored.

/** How long after the last pen movement a touch is still taken for a palm. */
export const PEN_PALM_WINDOW_MS = 800;

/** True when a touch on a button should be ignored because a pen was just active. */
export function ignoreTouchNearPen(pointerType: string, lastPenAt: number | null, now: number): boolean {
  return pointerType === "touch" && lastPenAt !== null && now - lastPenAt < PEN_PALM_WINDOW_MS;
}
