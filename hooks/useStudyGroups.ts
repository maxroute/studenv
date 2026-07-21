"use client";

import useSWR from "swr";
import { apiFetcher } from "@/lib/client/fetcher";
import type { StudyGroupRecord } from "@/types";

/**
 * SWR-backed hook for study groups.
 *
 * On the first mount the groups are fetched from the API. On subsequent
 * navigations the cached data is returned immediately and a background
 * revalidation is kicked off so the UI never blocks.
 */
export function useStudyGroups() {
  const swr = useSWR<StudyGroupRecord[]>(
    "/api/study-groups",
    apiFetcher,
    {
      // Keep stale data visible while revalidating in the background.
      revalidateOnFocus: false,
      // Deduplicate rapid re-mounts within 10 seconds.
      dedupingInterval: 10_000,
    },
  );

  function replaceGroupInPlace(
    current: StudyGroupRecord[],
    nextGroup: StudyGroupRecord,
  ) {
    const index = current.findIndex((entry) => entry.id === nextGroup.id);

    if (index === -1) {
      return [...current, nextGroup];
    }

    return current.map((entry, entryIndex) =>
      entryIndex === index ? nextGroup : entry,
    );
  }

  /** Optimistically add or replace a single group in the cache. */
  async function upsertGroup(group: StudyGroupRecord) {
    await swr.mutate(
      (current) => replaceGroupInPlace(current ?? [], group),
      { revalidate: false },
    );
  }

  /** Prepend a newly created group to the cache. */
  async function addGroup(group: StudyGroupRecord) {
    await swr.mutate(
      (current) => [group, ...(current ?? [])],
      { revalidate: false },
    );
  }

  /** Refresh a single group from the server and merge it into the cache. */
  async function refreshGroup(groupId: string) {
    const group = await apiFetcher<StudyGroupRecord>(
      `/api/study-groups/${groupId}`,
    );
    await upsertGroup(group);
    return group;
  }

  return {
    ...swr,
    groups: swr.data ?? [],
    upsertGroup,
    addGroup,
    refreshGroup,
  };
}

/**
 * SWR-backed hook for fetching detailed single study group information.
 * Uses key-based caching so switching between groups loads them instantly from cache.
 */
export function useStudyGroup(groupId: string | null) {
  const swr = useSWR<StudyGroupRecord>(
    groupId ? `/api/study-groups/${groupId}` : null,
    apiFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
    },
  );

  return {
    ...swr,
    group: swr.data,
    mutateActiveGroup: swr.mutate,
  };
}

