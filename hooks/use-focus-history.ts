"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { focusByDay, type FocusRecord } from "@/lib/client/study-calendar";

async function fetchHistory(url: string): Promise<FocusRecord[]> {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error || "Focus time could not be loaded.");
  return json.data;
}

/** Focus time per day from `first` up to (not including) `end`, both at the student's own midnight. */
export function useFocusHistory(first: Date, end: Date) {
  const { data, error } = useSWR(`/api/planner/history?from=${first.toISOString()}&to=${end.toISOString()}`, fetchHistory, { keepPreviousData: true });
  const days = useMemo(() => focusByDay(data ?? []), [data]);
  return { days, error: Boolean(error), loading: !data && !error };
}
