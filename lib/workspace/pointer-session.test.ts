import test from "node:test";
import assert from "node:assert/strict";
import {
  beginPointerSession,
  clearPointerSession,
  endPointerSession,
  ownsPointerSession,
} from "./pointer-session";

function createTarget() {
  const captured = new Set<number>();
  return {
    captured,
    setPointerCapture(pointerId: number) { captured.add(pointerId); },
    hasPointerCapture(pointerId: number) { return captured.has(pointerId); },
    releasePointerCapture(pointerId: number) { captured.delete(pointerId); },
  };
}

function createEvent(pointerId: number, overrides: Partial<{
  isPrimary: boolean;
  button: number;
}> = {}) {
  const calls = { prevented: 0, stopped: 0 };
  return {
    pointerId,
    isPrimary: overrides.isPrimary ?? true,
    button: overrides.button ?? 0,
    preventDefault() { calls.prevented += 1; },
    stopPropagation() { calls.stopped += 1; },
    calls,
  };
}

test("claims a primary pointer and captures it", () => {
  const target = createTarget();
  const event = createEvent(7);
  const session = beginPointerSession(event, target, null);

  assert.equal(session?.pointerId, 7);
  assert.equal(target.captured.has(7), true);
  assert.equal(event.calls.prevented, 1);
  assert.equal(event.calls.stopped, 1);
});

test("does not allow a second pointer to replace an active gesture", () => {
  const target = createTarget();
  const first = beginPointerSession(createEvent(7), target, null);
  const secondEvent = createEvent(8);
  const second = beginPointerSession(secondEvent, target, first);

  assert.equal(second, null);
  assert.equal(target.captured.has(7), true);
  assert.equal(target.captured.has(8), false);
  assert.equal(secondEvent.calls.prevented, 1);
  assert.equal(secondEvent.calls.stopped, 1);
  assert.equal(secondEvent.calls.prevented, 0);
});

test("rejects non-primary pointers and non-primary buttons", () => {
  const target = createTarget();
  assert.equal(beginPointerSession(createEvent(7, { isPrimary: false }), target, null), null);
  assert.equal(beginPointerSession(createEvent(8, { button: 2 }), target, null), null);
  assert.equal(target.captured.size, 0);
});

test("only the owning pointer can complete and release a gesture", () => {
  const target = createTarget();
  const session = beginPointerSession(createEvent(7), target, null);

  assert.equal(ownsPointerSession(session, { pointerId: 8 }), false);
  assert.equal(endPointerSession(session, { pointerId: 8 }), session);
  assert.equal(target.captured.has(7), true);

  assert.equal(endPointerSession(session, { pointerId: 7 }), null);
  assert.equal(target.captured.has(7), false);
});

test("cancellation or lost capture clears only the matching pointer", () => {
  const target = createTarget();
  const session = beginPointerSession(createEvent(7), target, null);

  assert.equal(clearPointerSession(session, { pointerId: 8 }), session);
  assert.equal(clearPointerSession(session, { pointerId: 7 }), null);
});
