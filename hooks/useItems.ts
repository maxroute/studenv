"use client";

import useSWR from "swr";
import { apiFetcher } from "@/lib/client/fetcher";
import type { ItemFilters, ItemRecord } from "@/types";

function buildQuery(filters: ItemFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    if (key === "nav") {
      return;
    }

    if (key === "sort" && value === "status") {
      return;
    }

    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `/api/items?${query}` : "/api/items";
}

/**
 * The full item, including `notes` and the untruncated `excerpt`, which list
 * rows from `useItems` leave out. Pass null (or an unsaved temp id) to skip.
 */
export function useItem(id: string | null) {
  const key = id && !id.startsWith("temp-") ? `/api/items/${id}` : null;
  const swr = useSWR<ItemRecord>(key, apiFetcher);

  return {
    ...swr,
    item: swr.data ?? null,
  };
}

export function useItems(filters: ItemFilters) {
  const key = buildQuery(filters);
  const swr = useSWR<ItemRecord[]>(key, apiFetcher);

  async function createItem(payload: Record<string, unknown>) {
    const tempItem: ItemRecord = {
      id: `temp-${Date.now()}`,
      userId: "",
      type: (payload.type as any) ?? "article",
      title: (payload.title as string) ?? "New Item",
      url: (payload.url as string) ?? null,
      excerpt: (payload.excerpt as string) ?? null,
      notes: (payload.notes as string) ?? null,
      status: (payload.status as any) ?? "unread",
      starred: (payload.starred as boolean) ?? false,
      sourceHost: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
    };

    const currentItems = swr.data ?? [];

    return swr.mutate(
      async (current) => {
        const created = await apiFetcher<ItemRecord>("/api/items", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return current ? [created, ...current.filter((item) => item.id !== tempItem.id)] : [created];
      },
      {
        optimisticData: [tempItem, ...currentItems],
        rollbackOnError: true,
        revalidate: true,
      }
    );
  }

  async function updateItem(id: string, payload: Record<string, unknown>) {
    const currentItems = swr.data ?? [];
    const updatedOptimistic = currentItems.map((item) =>
      item.id === id ? ({ ...item, ...payload } as ItemRecord) : item
    );

    return swr.mutate(
      async (current) => {
        const updated = await apiFetcher<ItemRecord>(`/api/items/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        return current?.map((item) => (item.id === id ? updated : item)) ?? [];
      },
      {
        optimisticData: updatedOptimistic,
        rollbackOnError: true,
        revalidate: true,
      }
    );
  }

  async function deleteItem(id: string) {
    const currentItems = swr.data ?? [];
    const deletedOptimistic = currentItems.filter((item) => item.id !== id);

    return swr.mutate(
      async (current) => {
        await apiFetcher(`/api/items/${id}`, { method: "DELETE" });
        return current?.filter((item) => item.id !== id) ?? [];
      },
      {
        optimisticData: deletedOptimistic,
        rollbackOnError: true,
        revalidate: true,
      }
    );
  }

  return {
    ...swr,
    items: swr.data ?? [],
    createItem,
    updateItem,
    deleteItem,
  };
}
