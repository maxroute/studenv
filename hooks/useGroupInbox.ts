"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetcher } from "@/lib/client/fetcher";
import type { GroupInboxEntry } from "@/lib/study-groups/inbox";

const KEY = "/api/study-groups/inbox";

/**
 * Unread counts and newest messages, checked again every `everyMs`. The hosted
 * site has no live socket, so this is how new messages are noticed. Checks stop
 * while the tab is hidden and run as soon as it is looked at again.
 */
export function useGroupInbox(everyMs: number) {
  const swr = useSWR<GroupInboxEntry[]>(KEY, apiFetcher, {
    refreshInterval: everyMs,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    revalidateOnFocus: true,
    dedupingInterval: 3_000,
  });
  const { mutate } = swr;

  const markRead = useCallback(
    async (groupId: string, upTo: string) => {
      // The badge goes at once; the server is told right after.
      void mutate((current) => current?.map((entry) => (entry.groupId === groupId ? { ...entry, unreadCount: 0 } : entry)), { revalidate: false });
      await fetch(`/api/study-groups/${groupId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upTo }),
      }).catch(() => undefined);
    },
    [mutate],
  );

  return { inbox: swr.data, markRead, refreshInbox: mutate };
}

/** True while this tab is the one being looked at. */
export function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
