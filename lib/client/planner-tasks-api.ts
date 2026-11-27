/**
 * The planner task list is read by several screens through one SWR cache entry,
 * so all of them must store the same thing in it: the list itself. Always load
 * it with these two together (or `usePlannerTasks`).
 */
export const PLANNER_TASKS_KEY = "/api/planner/tasks";

export async function fetchPlannerTasks<T = unknown>(url: string): Promise<T[]> {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  // Throwing keeps the last good list; returning an empty one would erase it everywhere.
  if (!response.ok || !json?.ok || !Array.isArray(json.data)) {
    // The status tells the app's retry rule not to repeat a request the server refused.
    throw Object.assign(new Error(json?.error || "Tasks could not be loaded."), { status: response.ok ? undefined : response.status });
  }
  return json.data as T[];
}
