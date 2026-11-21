import assert from "node:assert/strict";
import test from "node:test";
import { isUsageSummary, mergeUsage, resetLabel, spendQuestion, usageSummary, utcDayStart, type SpendDeps } from "./usage";

const day = new Date("2026-11-21T00:00:00Z");
const at = (iso: string) => new Date(iso);
const summary = (used: number, asOf: string, d = day) => usageSummary(25, used, d, at(asOf));

test("a summary says how many are left, when it resets and when it was true", () => {
  assert.deepEqual(summary(5, "2026-11-21T10:00:00Z"), { limit: 25, used: 5, remaining: 20, resetAt: "2026-11-22T00:00:00.000Z", asOf: "2026-11-21T10:00:00.000Z" });
  assert.equal(usageSummary(25, 99, day, at("2026-11-21T10:00:00Z")).remaining, 0, "never below zero");
  assert.equal(usageSummary(25, -3, day, at("2026-11-21T10:00:00Z")).used, 0, "never negative");
  assert.equal(utcDayStart(at("2026-11-21T23:59:59Z")).toISOString(), "2026-11-21T00:00:00.000Z");
});

test("only a well-formed summary is trusted", () => {
  const good = summary(5, "2026-11-21T10:00:00Z");
  assert.equal(isUsageSummary(good), true);
  for (const bad of [null, "x", {}, { ...good, remaining: 3 }, { ...good, asOf: "nope" }, { ...good, resetAt: 5 }, { ...good, used: -1, remaining: 26 }, { ...good, limit: 1.5 }]) {
    assert.equal(isUsageSummary(bad), false, JSON.stringify(bad));
  }
  // An older reply from before `asOf` existed is not trusted either.
  const { asOf: _asOf, ...old } = good;
  assert.equal(isUsageSummary(old), false);
});

test("a late reply never replaces a newer count; a new day always does", () => {
  const first = summary(6, "2026-11-21T10:00:00Z");
  const second = summary(7, "2026-11-21T10:00:05Z");
  assert.equal(mergeUsage(second, first), second, "the slower, older reply loses");
  assert.equal(mergeUsage(first, second), second);
  assert.equal(mergeUsage(null, first), first);
  assert.equal(mergeUsage(first, null), first);
  const tie = summary(6, "2026-11-21T10:00:00Z");
  assert.equal(mergeUsage(first, tie), tie, "a tie goes to the newcomer");
  const tomorrow = summary(0, "2026-11-22T00:00:01Z", new Date("2026-11-22T00:00:00Z"));
  assert.equal(mergeUsage(second, tomorrow), tomorrow, "the next day's count replaces yesterday's");
  const stale = summary(24, "2026-11-21T23:59:59Z");
  assert.equal(mergeUsage(tomorrow, stale), tomorrow, "yesterday's late reply can't bring it back");
});

test("the reset shows in the reader's own time", () => {
  assert.equal(resetLabel("2026-11-22T00:00:00.000Z", { locale: "en-IN", timeZone: "Asia/Kolkata" }), "5:30 am");
  assert.equal(resetLabel("2026-11-22T00:00:00.000Z", { locale: "en-US", timeZone: "America/New_York" }), "7:00 pm");
  assert.equal(resetLabel("not a date"), "");
});

function fakes(options: { used?: number; limit?: number; failCount?: boolean } = {}) {
  const state = { used: options.used ?? 0, refunds: 0 };
  const deps: SpendDeps = {
    dailyLimit: options.limit ?? 25,
    now: () => at("2026-11-21T10:00:00Z"),
    consumeQuestion: async (_u, _d, limit) => (state.used >= limit ? { allowed: false, used: state.used } : { allowed: true, used: ++state.used }),
    refundQuestion: async () => {
      state.refunds += 1;
      state.used -= 1;
    },
    getUsedCount: async () => {
      if (options.failCount) throw new Error("db down");
      return state.used;
    },
  };
  return { deps, state };
}

test("a successful question reports the count after it was taken", async () => {
  const { deps } = fakes({ used: 4 });
  const result = await spendQuestion(deps, "u1", async (usage) => usage, () => new Error("spent"));
  assert.equal(result.used, 5);
  assert.equal(result.remaining, 20);
});

test("a failed question is given back, and the error carries the true count", async () => {
  const { deps, state } = fakes({ used: 4 });
  await assert.rejects(
    spendQuestion(deps, "u1", async () => {
      throw Object.assign(new Error("model down"), { status: 502 });
    }, () => new Error("spent")),
    (error: Error & { usage?: { used: number; remaining: number } }) => {
      assert.equal(error.message, "model down");
      assert.deepEqual([error.usage?.used, error.usage?.remaining], [4, 21], "back to where it was");
      return true;
    },
  );
  assert.equal(state.refunds, 1);
});

test("if the count can't be read after a refund, the original error still comes out", async () => {
  const { deps } = fakes({ used: 4, failCount: true });
  await assert.rejects(
    spendQuestion(deps, "u1", async () => {
      throw new Error("model down");
    }, () => new Error("spent")),
    (error: Error & { usage?: { used: number } }) => error.message === "model down" && error.usage?.used === 5,
  );
});

test("a spent allowance is refused before anything runs, and says so with the count", async () => {
  const { deps } = fakes({ used: 25 });
  let ran = false;
  await assert.rejects(
    spendQuestion(deps, "u1", async () => {
      ran = true;
    }, () => Object.assign(new Error("all used"), { status: 429 })),
    (error: Error & { usage?: { remaining: number }; status?: number }) => error.status === 429 && error.usage?.remaining === 0,
  );
  assert.equal(ran, false);
});
