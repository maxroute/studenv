import { test } from "node:test";
import assert from "node:assert/strict";
import { createTaskSchema, focusHistoryQuerySchema, rescheduleTasksSchema, updateTaskSchema } from "./planner.model";

const id = "c" + "a".repeat(24);
const change = { id, dueDate: "2026-11-27T00:00:00.000Z", dueTime: null };

test("rescheduling accepts dates and cleared values only", () => {
  assert.equal(rescheduleTasksSchema.safeParse({ changes: [change] }).success, true);
  assert.equal(rescheduleTasksSchema.safeParse({ changes: [{ id, dueDate: null, dueTime: "19:00" }] }).success, true);
  for (const bad of [
    { changes: [] },
    { changes: [{ ...change, id: "1; drop" }] },
    { changes: [{ ...change, dueDate: "tomorrow" }] },
    { changes: [{ ...change, status: "completed" }] },
    { changes: [{ id }] },
    { changes: Array.from({ length: 501 }, () => change) },
    { changes: [change], userId: "someone" },
  ]) assert.equal(rescheduleTasksSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 80));
});

test("the history range is ordered and at most 62 days", () => {
  const range = (from: string, to: string) => focusHistoryQuerySchema.safeParse({ from, to }).success;
  assert.equal(range("2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z"), true);
  assert.equal(range("2026-12-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"), false);
  assert.equal(range("2026-01-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"), false);
  assert.equal(range("november", "2026-12-01T00:00:00.000Z"), false);
});

test("the app's today may be sent with date changes, but never set missed days directly", () => {
  assert.equal(rescheduleTasksSchema.safeParse({ changes: [change], today: "2026-11-27T00:00:00.000Z" }).success, true);
  assert.equal(updateTaskSchema.safeParse({ dueDate: "2026-11-28T00:00:00.000Z", today: "2026-11-27T00:00:00.000Z" }).success, true);
  assert.equal(updateTaskSchema.safeParse({ missedDueDates: [] }).success, false);
  assert.equal(createTaskSchema.safeParse({ title: "A", missedDueDates: [] }).success, false);
  // A change that leaves the date alone must not look like one that clears it.
  assert.equal("dueDate" in updateTaskSchema.parse({ status: "completed" }), false);
});
