"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardClient } from "@/components/items/dashboard-client";
import { useAppStore } from "@/hooks/useAppStore";
import { useItem } from "@/hooks/useItems";
import { openItemPage } from "@/lib/client/open-item-page";

export default function ShelfItemPage() {
  const { id } = useParams();
  const router = useRouter();
  const setSelectedId = useAppStore((state) => state.setSelectedId);
  const { item } = useItem(typeof id === "string" ? id : null);

  // Every item's details page is its page (created for a resource on first open).
  useEffect(() => {
    if (item) void openItemPage(item, router.replace);
  }, [item, router]);

  useEffect(() => {
    if (id) {
      setSelectedId(id as string);
    }
  }, [id, setSelectedId]);

  return <DashboardClient />;
}
