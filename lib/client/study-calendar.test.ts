import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, describeDay, focusByDay, focusLabel, studyDay } from "./study-calendar";

const now = new Date(2026, 10, 27, 12, 0);
const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString();
const due = (day: number, status = "pending") => ({ status, dueDate: `2026-11-${String(day).padStart(2, "0")}T00:00:00.000Z` });

test("focus time is grouped by the student's own day, even late at night", () => {
  const totals = focusByDay([
    { startedAt: at(26, 23), durationMs: 1000 },
    { startedAt: at(27, 0), durationMs: 2000 },
    { startedAt: at(27, 22), durationMs: 3000 },
  ]);
  assert.equal(totals.get("2026-11-26"), 1000);
  assert.equal(totals.get("2026-11-27"), 5000);
});

test("the fill grows with focus time", () => {
  const level = (minutes: number) => studyDay(now, [], new Map([[dayKey(now), minutes * 60_000]]), now).level;
  assert.deepEqual([0, 5, 29, 30, 89, 90, 400].map(level), [0, 1, 1, 2, 2, 3, 3]);
});

test("a finished day is ticked; cancelled tasks do not count", () => {
  const day = studyDay(new Date(2026, 10, 23), [due(23, "completed"), due(23, "cancelled")], new Map(), now);
  assert.deepEqual([day.tasks, day.done, day.allDone, day.unfinished, day.upcoming], [1, 1, true, false, false]);
});

test("open tasks are unfinished once the day has passed, upcoming until then", () => {
  const past = studyDay(new Date(2026, 10, 26), [due(26), due(26, "completed")], new Map(), now);
  assert.deepEqual([past.unfinished, past.upcoming, past.allDone], [true, false, false]);
  for (const day of [27, 30]) {
    const ahead = studyDay(new Date(2026, 10, day), [due(day)], new Map(), now);
    assert.deepEqual([ahead.unfinished, ahead.upcoming], [false, true]);
  }
});

test("a day with nothing is plain", () => {
  const empty = studyDay(new Date(2026, 10, 2), [], new Map(), now);
  assert.deepEqual([empty.level, empty.allDone, empty.upcoming, empty.unfinished], [0, false, false, false]);
  assert.equal(describeDay(empty), "No focus time · no tasks");
});

test("time reads in minutes and hours", () => {
  assert.deepEqual([45, 60, 725].map((minutes) => focusLabel(minutes * 60_000)), ["45 min", "1 h", "12 h 5 min"]);
});

test("a day with a task moved away unfinished is never ticked", () => {
  const moved = { status: "completed", dueDate: "2026-11-27T00:00:00.000Z", missedDueDates: ["2026-11-23T00:00:00.000Z"] };
  const day = studyDay(new Date(2026, 10, 23), [due(23, "completed"), moved], new Map(), now);
  assert.deepEqual([day.tasks, day.done, day.missed, day.allDone, day.unfinished], [1, 1, 1, false, true]);
  assert.equal(describeDay(day), "No focus time · 1 of 1 task done · 1 missed");
  const emptied = studyDay(new Date(2026, 10, 23), [moved], new Map(), now);
  assert.deepEqual([emptied.tasks, emptied.allDone, emptied.unfinished], [0, false, true]);
  assert.equal(describeDay(emptied), "No focus time · 1 missed");
});
