"use client";

import useSWR from "swr";
import { usePlannerTasks } from "@/hooks/use-planner-tasks";
import { apiFetcher } from "@/lib/client/fetcher";

/** The overview is read whole, not unwrapped from `data` like the other requests. */
async function overviewFetcher(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Not available");
  return response.json();
}

/**
 * Loads what Home, Library, Planner and Groups show, into the same cache they
 * read. Each entry must be stored in the shape those screens expect. The intro
 * doesn't wait for them: anything still on its way arrives behind it.
 */
export function useIntroPreload(): void {
  useSWR("/api/dashboard", overviewFetcher);
  usePlannerTasks();
  useSWR<unknown>("/api/items", apiFetcher);
  useSWR<unknown>("/api/collections", apiFetcher);
  useSWR<unknown>("/api/notes", apiFetcher);
  useSWR<unknown>("/api/library/boards", apiFetcher);
  useSWR<unknown>("/api/library/files", apiFetcher);
  useSWR<unknown>("/api/library/storage", apiFetcher);
  useSWR<unknown>("/api/study-groups", apiFetcher);
}
