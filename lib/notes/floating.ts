// ---------------------------------------------------------------------------
// Placing a fixed-position popup next to an anchor, inside the visible screen
// ---------------------------------------------------------------------------
//
// On phones the keyboard shrinks the visible area (the visual viewport), and
// browsers disagree on what element rects are relative to (iOS Safari: the
// visual viewport; Chrome: the layout viewport) while `position: fixed` is
// laid out against the layout viewport. So the popup's fixed origin is
// measured in rect coordinates and all maths happens there.

export type AnchorRect = { top: number; bottom: number; left: number };

// Space reserved at the bottom of the visible area (the phone keyboard
// toolbar), so popups are not placed under it.
let bottomInset = 0;
export function setFloatingBottomInset(px: number) {
  bottomInset = Math.max(0, px);
}

/** Where `position: fixed; top: 0` lands in rect coordinates, and the visible area in the same space. */
function visibleArea(element: HTMLElement) {
  element.style.top = "0px";
  element.style.left = "0px";
  const origin = element.getBoundingClientRect();
  const viewport = window.visualViewport;
  return {
    origin,
    top: (viewport?.offsetTop ?? 0) + origin.top,
    bottom: (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) + origin.top,
    left: (viewport?.offsetLeft ?? 0) + origin.left,
    right: (viewport ? viewport.offsetLeft + viewport.width : window.innerWidth) + origin.left,
  };
}

/** Pins `element` (position: fixed) to the bottom of the visible area: just above the phone keyboard when it is open. */
export function placeAtVisibleBottom(element: HTMLElement) {
  const area = visibleArea(element);
  const height = element.offsetHeight;
  element.style.top = `${area.bottom - height - area.origin.top}px`;
  element.style.left = `${area.left - area.origin.left}px`;
  element.style.width = `${area.right - area.left}px`;
}

/** Puts `popup` (position: fixed) below or above `anchor`, whichever has more room, capping its height to fit. */
export function placeFloating(popup: HTMLElement, anchor: AnchorRect, options: { gap?: number; maxHeight?: number } = {}) {
  const gap = options.gap ?? 6;
  popup.style.maxHeight = "";
  const area = visibleArea(popup);
  const origin = area.origin;
  const visibleTop = area.top + 8;
  const visibleBottom = area.bottom - bottomInset - 8;
  const visibleLeft = area.left + 8;
  const visibleRight = area.right - 8;
  const roomBelow = visibleBottom - (anchor.bottom + gap);
  const roomAbove = anchor.top - gap - visibleTop;
  const natural = Math.min(popup.scrollHeight, options.maxHeight ?? Number.POSITIVE_INFINITY);
  const height = Math.min(natural, Math.max(roomBelow, roomAbove, 120));
  popup.style.maxHeight = `${height}px`;
  const top = roomBelow >= height || roomBelow >= roomAbove ? anchor.bottom + gap : anchor.top - gap - height;
  const left = Math.max(visibleLeft, Math.min(anchor.left, visibleRight - origin.width));
  popup.style.top = `${Math.max(visibleTop, top) - origin.top}px`;
  popup.style.left = `${left - origin.left}px`;
}
