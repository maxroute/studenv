import { test } from "node:test";
import assert from "node:assert/strict";
import { nextMissedDays, studentToday, type MissedMove } from "./missed-days";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const days = (list: Date[]) => list.map((date) => date.toISOString().slice(0, 10));
const move = (extra: Partial<MissedMove> = {}) =>
  days(nextMissedDays({ missed: [], status: "pending", from: day("2026-11-23"), to: day("2026-11-27"), today: day("2026-11-27"), ...extra }));

test("moving an unfinished task off a past day records that day", () => {
  assert.deepEqual(move(), ["2026-11-23"]);
  assert.deepEqual(move({ status: "in_progress", to: day("2026-12-02") }), ["2026-11-23"]);
  assert.deepEqual(move({ to: null }), ["2026-11-23"]);
});

test("moving it back removes the record, which is how Undo works", () => {
  assert.deepEqual(move({ missed: [day("2026-11-23")], from: day("2026-11-27"), to: day("2026-11-23") }), []);
});

test("earlier records stay when it slips again, once each and in order", () => {
  assert.deepEqual(move({ missed: [day("2026-11-25"), day("2026-11-21")] }), ["2026-11-21", "2026-11-23", "2026-11-25"]);
  assert.deepEqual(move({ missed: [day("2026-11-23")] }), ["2026-11-23"]);
});

test("today's and future tasks record nothing", () => {
  assert.deepEqual(move({ from: day("2026-11-27"), to: day("2026-11-28") }), []);
  assert.deepEqual(move({ from: day("2026-11-30"), to: day("2026-12-01") }), []);
});

test("finished and cancelled tasks record nothing, nor does finishing while moving", () => {
  for (const extra of [{ status: "completed" }, { status: "cancelled" }, { nextStatus: "completed" }]) assert.deepEqual(move(extra), []);
});

test("the same day, an earlier day or no old date records nothing", () => {
  assert.deepEqual(move({ to: day("2026-11-23") }), []);
  assert.deepEqual(move({ to: day("2026-11-20") }), []);
  assert.deepEqual(move({ from: null }), []);
});

test("a stored time of day does not change which day it is", () => {
  assert.deepEqual(move({ from: new Date("2026-11-23T19:45:00.000Z") }), ["2026-11-23"]);
});

test("the app's today is used when it is within a day of the server's", () => {
  // 01:00 on the 27th in India is still the 26th for the server.
  const server = new Date("2026-11-26T19:30:00.000Z");
  assert.equal(studentToday("2026-11-27T00:00:00.000Z", server)?.toISOString(), "2026-11-27T00:00:00.000Z");
  assert.equal(studentToday("2026-11-25T00:00:00.000Z", server)?.toISOString(), "2026-11-25T00:00:00.000Z");
  assert.equal(studentToday("2026-11-29T00:00:00.000Z", server), null);
  assert.equal(studentToday("2026-01-01T00:00:00.000Z", server), null);
});

test("without it, only days past everywhere count", () => {
  assert.equal(studentToday(undefined, new Date("2026-11-27T12:00:00.000Z"))?.toISOString(), "2026-11-26T00:00:00.000Z");
});
