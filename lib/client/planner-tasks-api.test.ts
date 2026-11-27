import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchPlannerTasks, PLANNER_TASKS_KEY } from "./planner-tasks-api";
import { shouldRetry } from "./load-state";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const reply = (body: unknown, status = 200) => {
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status });
};

test("the cache holds the list itself, not the reply around it", async () => {
  reply({ ok: true, data: [{ id: "a" }] });
  assert.deepEqual(await fetchPlannerTasks(PLANNER_TASKS_KEY), [{ id: "a" }]);
});

test("a failed load throws instead of caching an empty list", async () => {
  for (const [body, status] of [[{ ok: false, error: "Nope" }, 200], [{ ok: true, data: [] }, 500], [{ ok: true, data: null }, 200], [null, 200]] as const) {
    reply(body, status);
    await assert.rejects(fetchPlannerTasks(PLANNER_TASKS_KEY));
  }
});

test("a refused request is not repeated; a server failure is", async () => {
  for (const [status, retries] of [[401, false], [429, false], [500, true]] as const) {
    reply({ ok: false, error: "Nope" }, status);
    const error = await fetchPlannerTasks(PLANNER_TASKS_KEY).then(() => null, (reason: unknown) => reason);
    assert.equal(shouldRetry(error, 0), retries, String(status));
  }
});

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

// The Focus page once cached the whole reply here while other screens cached the
// list, which left its task picker empty. No screen may load this key its own way.
test("no screen subscribes to the task list with its own loader", () => {
  const ownLoader = /useSWR\b[^()]*\(\s*(?:["'`]\/api\/planner\/tasks["'`]|TASKS_KEY)\s*,/;
  const offenders = ["app", "components", "hooks"].flatMap(sources).filter((path) => ownLoader.test(readFileSync(path, "utf8")));
  assert.deepEqual(offenders, []);
});
