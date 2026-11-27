"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { fetchPlannerTasks, PLANNER_TASKS_KEY } from "@/lib/client/planner-tasks-api";

/** The student's planner tasks, shared by every screen that shows or watches them. */
export function usePlannerTasks<T>(config?: SWRConfiguration<T[]>) {
  return useSWR<T[]>(PLANNER_TASKS_KEY, fetchPlannerTasks<T>, config);
}
