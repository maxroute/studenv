import assert from "node:assert/strict";
import test from "node:test";
import { isConnectionError, waitUntilReady, withConnectTimeout } from "./connection";

test("the connect timeout is added once and never overrides one that is set", () => {
  assert.match(withConnectTimeout("postgresql://u:p@h.example/db?sslmode=require") ?? "", /connect_timeout=20/);
  assert.match(withConnectTimeout("postgresql://u:p@h.example/db?sslmode=require") ?? "", /sslmode=require/);
  assert.match(withConnectTimeout("postgresql://u:p@h.example/db?connect_timeout=5") ?? "", /connect_timeout=5$/);
  assert.equal(withConnectTimeout(undefined), undefined);
  assert.equal(withConnectTimeout("not a url"), "not a url");
});

test("only connection failures count as connection errors", () => {
  assert.equal(isConnectionError({ code: "P1001" }), true);
  assert.equal(isConnectionError(new Error("Can't reach database server at host")), true);
  assert.equal(isConnectionError({ code: "P2002" }), false);
  assert.equal(isConnectionError(new Error("boom")), false);
});

test("a cold database is retried, a real error is not", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  await waitUntilReady(async () => { calls += 1; if (calls < 3) throw { code: "P1001" }; }, { sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [800, 1600]);

  calls = 0;
  await assert.rejects(waitUntilReady(async () => { calls += 1; throw new Error("syntax"); }, { sleep: async () => {} }));
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(waitUntilReady(async () => { calls += 1; throw { code: "P1001" }; }, { sleep: async () => {} }));
  assert.equal(calls, 3);
});
