import { test } from "node:test";
import assert from "node:assert/strict";
import { desktopTimerState, type DesktopTimerState, type TimerSnapshot } from "./timer-state";

const idle: DesktopTimerState = { status: "idle" };

const session = {
  id: "1-focus",
  type: "focus" as const,
  goal: "Read chapter 4",
  durationMs: 1_500_000,
  expectedEndAt: 2_000_000,
  pausedAt: null,
};

const running: TimerSnapshot = { activeSession: session, selectedType: "focus", pendingCompletion: null };
const none: TimerSnapshot = { activeSession: null, selectedType: "focus", pendingCompletion: null };
const ranOut: TimerSnapshot = { activeSession: null, selectedType: "shortBreak", pendingCompletion: { type: "focus" } };

test("nothing running is idle", () => {
  assert.deepEqual(desktopTimerState(none, null, idle), idle);
});

test("a running session sends its end time and task", () => {
  assert.deepEqual(desktopTimerState(running, none, idle), {
    status: "running",
    sessionId: "1-focus",
    label: "Focus",
    title: "Read chapter 4",
    endsAt: 2_000_000,
    durationMs: 1_500_000,
  });
});

test("a paused session sends the time that is left", () => {
  const paused = { ...running, activeSession: { ...session, pausedAt: 1_400_000 } };
  const state = desktopTimerState(paused, running, idle);
  assert.equal(state.status, "paused");
  assert.equal(state.status === "paused" && state.remainingMs, 600_000);
});

test("an unnamed session and a break have no task line", () => {
  for (const activeSession of [
    { ...session, goal: "Untitled focus block" },
    { ...session, type: "shortBreak" as const, goal: "Short break" },
  ]) {
    const state = desktopTimerState({ ...running, activeSession }, none, idle);
    assert.equal(state.status === "running" && state.title, "");
  }
});

test("running out is finished, and offers the break", () => {
  const state = desktopTimerState(ranOut, running, idle);
  assert.deepEqual(state, {
    status: "finished",
    sessionId: "1-focus",
    label: "Focus",
    title: "Read chapter 4",
    canStartBreak: true,
  });
});

test("finished stays while the completion is being saved", () => {
  const finished = desktopTimerState(ranOut, running, idle);
  const consumed = { ...ranOut, pendingCompletion: null };
  assert.equal(desktopTimerState(consumed, ranOut, finished), finished);
});

test("picking another kind of session leaves finished", () => {
  const finished = desktopTimerState(ranOut, running, idle);
  const consumed = { ...ranOut, pendingCompletion: null };
  assert.deepEqual(desktopTimerState(none, consumed, finished), idle);
});

test("reset and skip are not finished", () => {
  assert.deepEqual(desktopTimerState(none, running, idle), idle);
  assert.deepEqual(desktopTimerState({ ...none, selectedType: "shortBreak" }, running, idle), idle);
});
