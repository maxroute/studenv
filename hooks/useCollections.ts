"use client";

import useSWR from "swr";
import { apiFetcher } from "@/lib/client/fetcher";
import type { CollectionRecord } from "@/types";

function sortCollections(collections: CollectionRecord[]) {
  return [...collections].sort((a, b) => a.title.localeCompare(b.title));
}

export function useCollections() {
  const swr = useSWR<CollectionRecord[]>("/api/collections", apiFetcher);

  async function createCollection(payload: Record<string, unknown>) {
    const tempCollection: CollectionRecord = {
      id: `temp-${Date.now()}`,
      userId: "",
      title: (payload.title as string) ?? "New Collection",
      description: (payload.description as string) ?? null,
      itemIds: (payload.itemIds as string[]) ?? [],
      itemCount: ((payload.itemIds as string[]) ?? []).length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const currentCollections = swr.data ?? [];

    return swr.mutate(
      async (current) => {
        const created = await apiFetcher<CollectionRecord>("/api/collections", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return sortCollections(current ? [created, ...current.filter((c) => c.id !== tempCollection.id)] : [created]);
      },
      {
        optimisticData: sortCollections([tempCollection, ...currentCollections]),
        rollbackOnError: true,
        revalidate: true,
      }
    );
  }

  async function updateCollection(id: string, payload: Record<string, unknown>) {
    const currentCollections = swr.data ?? [];
    const updatedOptimistic = sortCollections(
      currentCollections.map((collection) =>
        collection.id === id
          ? ({
              ...collection,
              ...payload,
              itemCount: (payload.itemIds as string[] ?? collection.itemIds).length,
            } as CollectionRecord)
          : collection
      )
    );

    return swr.mutate(
      async (current) => {
        const updated = await apiFetcher<CollectionRecord>(`/api/collections/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        return sortCollections(current?.map((collection) => (collection.id === id ? updated : collection)) ?? []);
      },
      {
        optimisticData: updatedOptimistic,
        rollbackOnError: true,
        revalidate: true,
      }
    );
  }

  async function deleteCollection(id: string) {
    const currentCollections = swr.data ?? [];
    const deletedOptimistic = currentCollections.filter((collection) => collection.id !== id);

    return swr.mutate(
      async (current) => {
        await apiFetcher(`/api/collections/${id}`, { method: "DELETE" });
        return current?.filter((collection) => collection.id !== id) ?? [];
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
    collections: swr.data ?? [],
    createCollection,
    updateCollection,
    deleteCollection,
  };
}
