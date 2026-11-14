import test from "node:test";
import assert from "node:assert/strict";
import { intervalDays, newReviewState, retrievability, schedule, type Rating } from "./scheduler";

const NOW = new Date("2026-11-14T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY);

test("a new card: Again and Hard stay in learning minutes away; Good and Easy schedule days, Easy furthest", () => {
  const fresh = newReviewState(NOW);
  const again = schedule(fresh, 1, NOW);
  const hard = schedule(fresh, 2, NOW);
  const good = schedule(fresh, 3, NOW);
  const easy = schedule(fresh, 4, NOW);
  assert.equal(again.state, "learning");
  assert.ok(again.due.getTime() - NOW.getTime() <= 60_000);
  assert.equal(hard.state, "learning");
  assert.equal(good.state, "review");
  assert.ok(days(NOW, good.due) >= 1);
  assert.ok(days(NOW, easy.due) > days(NOW, good.due), "easy > good");
  assert.ok((easy.difficulty ?? 0) < (good.difficulty ?? 0), "easy makes the card easier");
});

test("successful reviews on time keep stretching the interval", () => {
  let state = schedule(newReviewState(NOW), 3, NOW);
  let now = state.due;
  const intervals: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const next = schedule(state, 3, now);
    intervals.push(days(now, next.due));
    state = next;
    now = next.due;
  }
  for (let i = 1; i < intervals.length; i += 1) assert.ok(intervals[i] > intervals[i - 1], `interval ${i} grows: ${intervals}`);
  assert.equal(state.reps, 6);
});

test("forgetting a review card sends it to relearning with lower stability and counts a lapse", () => {
  const learned = schedule(schedule(newReviewState(NOW), 3, NOW), 3, new Date(NOW.getTime() + 3 * DAY));
  const later = new Date(learned.due.getTime());
  const forgot = schedule(learned, 1, later);
  assert.equal(forgot.state, "relearning");
  assert.equal(forgot.lapses, 1);
  assert.ok((forgot.stability ?? 0) < (learned.stability ?? 0));
  const back = schedule(forgot, 3, new Date(later.getTime() + 10 * 60_000));
  assert.equal(back.state, "review");
});

test("Hard < Good < Easy for the same review card", () => {
  const card = schedule(newReviewState(NOW), 3, NOW);
  const at = card.due;
  const result = ([2, 3, 4] as Rating[]).map((rating) => days(at, schedule(card, rating, at).due));
  assert.ok(result[0] <= result[1] && result[1] < result[2], `${result}`);
});

test("difficulty stays within 1..10 and intervals within bounds", () => {
  let state = schedule(newReviewState(NOW), 1, NOW);
  for (let i = 0; i < 30; i += 1) state = schedule(state, 1, new Date(NOW.getTime() + i * DAY));
  assert.ok((state.difficulty ?? 0) <= 10 && (state.difficulty ?? 0) >= 1);
  assert.equal(intervalDays(0.01), 1);
  assert.equal(intervalDays(1e9), 36500);
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 0.01, "R is 90% after S days");
});
