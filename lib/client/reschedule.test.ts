import { test } from "node:test";
import assert from "node:assert/strict";
import { dayToDueDate, moveTask, previousDates, spreadTasks } from "./reschedule";
import { isDueOn, isOverdueTask } from "./planner-tasks";

const now = new Date(2026, 10, 27, 16, 30);
const task = (id: string, extra: Record<string, unknown> = {}) => ({ id, priority: "medium", dueDate: "2026-11-20T00:00:00.000Z", dueTime: null as string | null, ...extra });

// The old Today and Tomorrow buttons sent the current moment, which just after
// midnight east of Greenwich is still "yesterday" in UTC.
test("a day is stored as that calendar day, whatever the time of day", () => {
  for (const hour of [0, 1, 12, 23]) {
    const stored = dayToDueDate(new Date(2026, 10, 27, hour, 30));
    assert.equal(stored, "2026-11-27T00:00:00.000Z");
    assert.equal(isDueOn(stored, now), true);
  }
});

test("moving to today clears a time that has passed and keeps a later one", () => {
  assert.equal(moveTask(task("a", { dueTime: "09:00" }), now, now).dueTime, null);
  assert.equal(moveTask(task("b", { dueTime: "19:00" }), now, now).dueTime, "19:00");
  assert.equal(moveTask(task("c", { dueTime: "09:00" }), new Date(2026, 10, 28), now).dueTime, "09:00");
});

test("nothing moved to today is still overdue", () => {
  const moved = moveTask(task("a", { dueTime: "16:30" }), now, now);
  assert.equal(isOverdueTask({ status: "pending", ...moved }, now.getTime()), false);
});

test("spreading shares tasks evenly, earlier days first, across a month end", () => {
  const changes = spreadTasks(Array.from({ length: 16 }, (_, index) => task(String(index))), now);
  const perDay = new Map<string, number>();
  for (const change of changes) perDay.set(change.dueDate!.slice(0, 10), (perDay.get(change.dueDate!.slice(0, 10)) ?? 0) + 1);
  assert.deepEqual([...perDay], [["2026-11-27", 3], ["2026-11-28", 3], ["2026-11-29", 2], ["2026-11-30", 2], ["2026-12-01", 2], ["2026-12-02", 2], ["2026-12-03", 2]]);
  assert.equal(new Set(changes.map((change) => change.id)).size, 16);
});

test("urgent work comes first, then what has waited longest", () => {
  const changes = spreadTasks(
    [task("new", { dueDate: "2026-11-26T00:00:00.000Z" }), task("old", { dueDate: "2026-11-01T00:00:00.000Z" }), task("urgent", { priority: "urgent" })],
    now,
  );
  assert.deepEqual(changes.map((change) => [change.id, change.dueDate!.slice(8, 10)]), [["urgent", "27"], ["old", "28"], ["new", "29"]]);
});

test("undo puts every date and time back", () => {
  const before = [task("a", { dueTime: "09:00" }), task("b", { dueDate: null })];
  assert.deepEqual(previousDates(before), [
    { id: "a", dueDate: "2026-11-20T00:00:00.000Z", dueTime: "09:00" },
    { id: "b", dueDate: null, dueTime: null },
  ]);
});
