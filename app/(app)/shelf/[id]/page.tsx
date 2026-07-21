"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { DashboardClient } from "@/components/items/dashboard-client";
import { useAppStore } from "@/hooks/useAppStore";

export default function ShelfItemPage() {
  const { id } = useParams();
  const setSelectedId = useAppStore((state) => state.setSelectedId);

  useEffect(() => {
    if (id) {
      setSelectedId(id as string);
    }
  }, [id, setSelectedId]);

  return <DashboardClient />;
}
