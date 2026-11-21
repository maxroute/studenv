import assert from "node:assert/strict";
import test from "node:test";
import { appArea, asksForTask, clockOrUtc, parseTaskDrafts, settleDue, taskInstruction, taskPayload } from "./task";

const clock = { today: "2026-11-21", time: "20:15", timeZone: "Asia/Kolkata" };

test("the part of the app is read from the path", () => {
  assert.equal(appArea("/dashboard/planner"), "planner");
  assert.equal(appArea("/dashboard/planner?x=1"), "planner");
  assert.equal(appArea("/dashboard"), "dashboard");
  assert.equal(appArea("/dashboard/groups/abc"), "groups");
  assert.equal(appArea("/shelf"), "shelf");
  assert.equal(appArea("/notes/c123"), "page");
  assert.equal(appArea("/workspaces/c123"), "board");
  assert.equal(appArea("/about"), "other");
});

test("a message that names a task or the planner, and nothing else to make, is a task", () => {
  assert.equal(asksForTask("make a work that i want to solve 5 dsa problems before 12 am in the planner"), true);
  assert.equal(asksForTask("remind me to revise graphs tomorrow at 6"), true);
  assert.equal(asksForTask("add a to-do: finish the lab report"), true);
  assert.equal(asksForTask("make a page about planner apps"), false, "a page was asked for");
  assert.equal(asksForTask("what is a binary tree?"), false);
});

test("the instruction gives the student's own day, weekday and time", () => {
  const text = taskInstruction("solve 5 problems before 12 am", clock);
  assert.match(text, /Saturday 2026-11-21/);
  assert.match(text, /20:15 \(Asia\/Kolkata\)/);
  assert.match(text, /before 12 am.*23:59/);
});

test("midnight is the last minute of the day before, never a day already gone", () => {
  assert.deepEqual(settleDue("2026-11-22", "00:00", clock), { day: "2026-11-21", time: "23:59" });
  assert.deepEqual(settleDue("2026-11-21", "24:00", clock), { day: "2026-11-21", time: "23:59" }, "24:00 today is tonight");
  assert.deepEqual(settleDue("2026-11-21", "00:00", clock), { day: "2026-11-21", time: "23:59" }, "rolled back past today, it stays today");
  assert.deepEqual(settleDue("2026-11-19", "09:00", clock), { day: "2026-11-21", time: "09:00" });
  assert.deepEqual(settleDue("2026-02-30", "25:00", clock), { day: "2026-11-21", time: null }, "not a real day or time");
  assert.deepEqual(settleDue("2031-01-01", null, clock), { day: "2026-11-21", time: null }, "more than a year ahead");
  assert.deepEqual(settleDue("2026-11-24", "18:30", clock), { day: "2026-11-24", time: "18:30" });
});

test("drafted tasks are checked, capped and given safe values", () => {
  const reply = JSON.stringify({
    tasks: [
      { title: "  Solve 5   DSA problems ", day: "2026-11-22", time: "00:00", priority: "HIGH", category: "study", minutes: 90, notes: "" },
      { title: "", day: "2026-11-21" },
      { title: "Read chapter 3", day: "nope", time: "7pm", priority: "whenever", category: "Gym", minutes: 2 },
      "junk",
    ],
  });
  assert.deepEqual(parseTaskDrafts(`Here you go:\n${reply}`, clock), [
    { title: "Solve 5 DSA problems", day: "2026-11-21", time: "23:59", priority: "high", category: "Study", minutes: 90, notes: null },
    { title: "Read chapter 3", day: "2026-11-21", time: null, priority: "medium", category: "Study", minutes: null, notes: null },
  ]);
  const many = JSON.stringify({ tasks: Array.from({ length: 30 }, (_, i) => ({ title: `T${i}`, day: "2026-11-21" })) });
  assert.equal(parseTaskDrafts(many, clock).length, 10);
  assert.deepEqual(parseTaskDrafts("Sorry, I can't.", clock), []);
});

test("a task is saved the way the planner stores its own", () => {
  assert.deepEqual(
    taskPayload({ title: "Solve 5 DSA problems", day: "2026-11-21", time: "23:59", priority: "medium", category: "Study", minutes: null, notes: null }),
    { title: "Solve 5 DSA problems", priority: "medium", category: "Study", dueDate: "2026-11-21T00:00:00.000Z", dueTime: "23:59", estimatedDuration: null, notes: null },
  );
});

test("without a usable clock from the browser, the server's UTC clock is used", () => {
  const now = new Date("2026-11-21T18:40:00Z");
  assert.deepEqual(clockOrUtc(undefined, now), { today: "2026-11-21", time: "18:40", timeZone: "UTC" });
  assert.deepEqual(clockOrUtc({ today: "21/11/2026", time: "x" }, now), { today: "2026-11-21", time: "18:40", timeZone: "UTC" });
  assert.deepEqual(clockOrUtc(clock, now), clock);
});
