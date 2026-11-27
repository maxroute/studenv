import { test } from "node:test";
import assert from "node:assert/strict";
import { groupOpenTasks, isDueOn, isOverdueTask, taskDueAt } from "./planner-tasks";

const now = new Date(2026, 10, 27, 14, 0);
const task = (id: string, dueDate: string | null, dueTime: string | null = null, status = "pending") => ({ id, dueDate, dueTime, status });

test("a due date keeps its calendar day in any time zone", () => {
  assert.equal(isDueOn("2026-11-27T00:00:00.000Z", now), true);
  assert.equal(isDueOn("2026-11-28T00:00:00.000Z", now), false);
  assert.equal(isDueOn(null, now), false);
});

test("a task without a time is due at the end of its day", () => {
  assert.equal(taskDueAt(task("a", "2026-11-27T00:00:00.000Z")), new Date(2026, 10, 27, 23, 59).getTime());
  assert.equal(isOverdueTask(task("a", "2026-11-27T00:00:00.000Z"), now.getTime()), false);
  assert.equal(isOverdueTask(task("b", "2026-11-27T00:00:00.000Z", "09:00"), now.getTime()), true);
});

test("finished and cancelled tasks are never overdue", () => {
  assert.equal(isOverdueTask(task("a", "2026-11-01T00:00:00.000Z", null, "completed"), now.getTime()), false);
  assert.equal(isOverdueTask(task("b", "2026-11-01T00:00:00.000Z", null, "cancelled"), now.getTime()), false);
});

test("open tasks are grouped in order, without empty groups", () => {
  const groups = groupOpenTasks(
    [
      task("later", "2026-12-02T00:00:00.000Z"),
      task("today-2", "2026-11-27T00:00:00.000Z", "19:00"),
      task("late", "2026-11-26T00:00:00.000Z"),
      task("today-1", "2026-11-27T00:00:00.000Z", "15:00"),
      task("none", null),
      task("done", "2026-11-27T00:00:00.000Z", null, "completed"),
    ],
    now,
  );
  assert.deepEqual(
    groups.map((group) => [group.key, group.tasks.map((entry) => entry.id)]),
    [["overdue", ["late"]], ["today", ["today-2", "today-1"]], ["later", ["later"]], ["someday", ["none"]]],
  );
});

test("tomorrow works across a month end", () => {
  const groups = groupOpenTasks([task("a", "2026-12-01T00:00:00.000Z")], new Date(2026, 10, 30, 8, 0));
  assert.equal(groups[0]?.key, "tomorrow");
});
