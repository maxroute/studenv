// While two fingers pan or pinch the canvas, a drag the first finger started
// on an item must not move it. Shared by the canvas navigation hook and the
// item drag handlers (react-rnd), which cannot see each other's state.

let multiTouchNavigating = false;

export function setMultiTouchNavigating(active: boolean) {
  multiTouchNavigating = active;
}

export function isMultiTouchNavigating() {
  return multiTouchNavigating;
}
