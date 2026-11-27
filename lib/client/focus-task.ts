import { useFocusStore } from "@/hooks/useFocusStore";

/**
 * Gets the Focus page ready for a planner task. A session that is already
 * running is left alone: returns false, and the page shows that session.
 */
export function prepareFocusOnTask(task: { id: string; title: string }): boolean {
  const store = useFocusStore.getState();
  if (store.activeSession) return false;
  if (store.selectedType !== "focus") store.switchType("focus");
  store.setTaskId(task.id);
  store.setGoal(task.title);
  return true;
}
