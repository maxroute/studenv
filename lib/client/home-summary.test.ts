import { test } from "node:test";
import assert from "node:assert/strict";
import { focusTotals, oldestOverdueLabel, weekSoFar } from "./home-summary";
import { dayKey } from "./study-calendar";

// Friday 27 November 2026.
const now = new Date(2026, 10, 27, 18, 0);

test("the week runs from Sunday to the end of today", () => {
  const { from, to } = weekSoFar(now);
  assert.equal(dayKey(from), "2026-11-22");
  assert.equal(dayKey(to), "2026-11-28");
  assert.equal(dayKey(weekSoFar(new Date(2026, 10, 22, 1, 0)).from), "2026-11-22");
});

test("today and the week are added up separately", () => {
  const days = new Map([
    ["2026-11-21", 999],
    ["2026-11-22", 100],
    ["2026-11-26", 20],
    ["2026-11-27", 3],
  ]);
  assert.deepEqual(focusTotals(days, now), { todayMs: 3, weekMs: 123 });
  assert.deepEqual(focusTotals(new Map(), now), { todayMs: 0, weekMs: 0 });
});

test("the alert names the oldest overdue day", () => {
  const due = (date: string) => ({ dueDate: `${date}T00:00:00.000Z`, dueTime: null });
  assert.equal(oldestOverdueLabel([due("2026-11-25"), due("2026-11-22")], now), "Sun, Nov 22");
  assert.equal(oldestOverdueLabel([{ ...due("2026-11-27"), dueTime: "09:00" }], now), "today");
  assert.equal(oldestOverdueLabel([], now), null);
});
