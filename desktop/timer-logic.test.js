const { test } = require("node:test");
const assert = require("node:assert/strict");
const logic = require("./timer-logic");

const running = {
  status: "running",
  sessionId: "1-focus",
  label: "Focus",
  title: "Read chapter 4",
  durationMs: 1_500_000,
  endsAt: 2_000_000,
};
const finished = { status: "finished", sessionId: "1-focus", label: "Focus", title: "", canStartBreak: true };
const away = { enabled: true, mainFocused: false, hiddenSessionId: null, seenFinishedId: null };

test("well-formed messages are read, extra fields dropped", () => {
  assert.deepEqual(logic.parseTimerState({ ...running, extra: "x" }), running);
  assert.deepEqual(logic.parseTimerState(finished), finished);
  assert.deepEqual(logic.parseTimerState({ status: "idle" }), { status: "idle" });
});

test("unexpected messages are refused", () => {
  for (const bad of [
    null,
    "running",
    {},
    { ...running, status: "other" },
    { ...running, sessionId: "" },
    { ...running, title: "x".repeat(201) },
    { ...running, label: 7 },
    { ...running, durationMs: 0 },
    { ...running, endsAt: NaN },
    { ...running, status: "paused" },
  ]) {
    assert.equal(logic.parseTimerState(bad), null);
  }
});

test("the clock rounds up and never goes below zero", () => {
  assert.equal(logic.clockText(logic.timeLeftMs(running, 500_001)), "25:00");
  assert.equal(logic.clockText(logic.timeLeftMs(running, 1_999_999)), "00:01");
  assert.equal(logic.clockText(logic.timeLeftMs(running, 3_000_000)), "00:00");
  assert.equal(logic.ringLeft(running, 1_250_000), 0.5);
});

test("the small timer shows only while away from Studenv", () => {
  assert.equal(logic.shouldShowMini({ ...away, state: running }), true);
  assert.equal(logic.shouldShowMini({ ...away, state: running, mainFocused: true }), false);
  assert.equal(logic.shouldShowMini({ ...away, state: running, enabled: false }), false);
  assert.equal(logic.shouldShowMini({ ...away, state: { status: "idle" } }), false);
});

test("hiding lasts for that session only", () => {
  const hidden = { ...away, hiddenSessionId: "1-focus" };
  assert.equal(logic.shouldShowMini({ ...hidden, state: running }), false);
  assert.equal(logic.shouldShowMini({ ...hidden, state: { ...running, sessionId: "2-focus" } }), true);
});

test("a finished session that was already seen stays away", () => {
  assert.equal(logic.shouldShowMini({ ...away, state: finished }), true);
  assert.equal(logic.shouldShowMini({ ...away, state: finished, seenFinishedId: "1-focus" }), false);
});

test("a remembered position is used only while it is on a screen", () => {
  const screens = [{ x: 0, y: 25, width: 1440, height: 875 }];
  const size = { width: 320, height: 84 };
  assert.deepEqual(logic.miniPosition({ x: 40, y: 60 }, size, screens), { x: 40, y: 60 });
  const corner = { x: 1104, y: 41 };
  assert.deepEqual(logic.miniPosition({ x: 2000, y: 60 }, size, screens), corner);
  assert.deepEqual(logic.miniPosition(null, size, screens), corner);
});

test("only https, or http on this computer, can be the app's address", () => {
  assert.equal(logic.appUrl(undefined).origin, "http://localhost:3000");
  assert.equal(logic.appUrl("https://example.test").origin, "https://example.test");
  assert.throws(() => logic.appUrl("http://example.test"));
  assert.throws(() => logic.appUrl("file:///etc/hosts"));
});

test("other sites are not the app, and only web or mail links open outside", () => {
  assert.equal(logic.sameOrigin("http://localhost:3000/planner", "http://localhost:3000"), true);
  assert.equal(logic.sameOrigin("http://localhost:3000.example.test/", "http://localhost:3000"), false);
  assert.equal(logic.sameOrigin("not a url", "http://localhost:3000"), false);
  assert.equal(logic.canOpenOutside("https://example.test"), true);
  assert.equal(logic.canOpenOutside("file:///etc/hosts"), false);
  assert.equal(logic.canOpenOutside("javascript:alert(1)"), false);
});
