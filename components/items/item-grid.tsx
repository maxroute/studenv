"use client";

import type { ItemRecord } from "@/types";
import { ItemCard } from "@/components/items/item-card";

type ItemGridProps = {
  items: ItemRecord[];
  view: "grid" | "list";
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onToggleStar: (item: ItemRecord) => void;
};

function CardSkeleton({ view }: { view: "grid" | "list" }) {
  return (
    <div className={`card animate-pulse bg-[#1b1b16] border border-white/[0.065] ${view === "list" ? "list-mode" : ""}`}>
      <div className="card-type flex justify-between items-center mb-3">
        <div className="h-4 w-12 bg-white/10 rounded"></div>
        <div className="h-4 w-4 bg-white/10 rounded-full"></div>
      </div>
      <div className="h-5 bg-white/10 rounded w-5/6 mb-3"></div>
      <div className="space-y-2 mb-4">
        <div className="h-3.5 bg-white/10 rounded w-full"></div>
        <div className="h-3.5 bg-white/10 rounded w-2/3"></div>
      </div>
      <div className="flex gap-2 mb-4">
        <div className="h-4 w-10 bg-white/10 rounded"></div>
        <div className="h-4 w-14 bg-white/10 rounded"></div>
      </div>
      <div className="card-footer border-t border-white/[0.04] pt-3 flex justify-between items-center mt-auto">
        <div className="h-4 w-16 bg-white/10 rounded"></div>
        <div className="h-3 w-12 bg-white/10 rounded"></div>
      </div>
    </div>
  );
}

export function ItemGrid({
  items,
  view,
  selectedId,
  isLoading,
  onSelect,
  onToggleStar,
}: ItemGridProps) {
  if (isLoading) {
    return (
      <div className={`cards-grid ${view === "list" ? "list-view" : ""}`}>
        {[...Array(6)].map((_, i) => (
          <CardSkeleton key={i} view={view} />
        ))}
      </div>
    );
  }

  return (
    <div className={`cards-grid ${view === "list" ? "list-view" : ""}`}>
      {!items.length ? (
        <div className="empty-state">
          <div className="empty-icon">◈</div>
          <div className="empty-title">Nothing here</div>
          <div className="empty-sub">Try different filters or add a new item</div>
        </div>
      ) : (
        items.map((item, index) => (
          <ItemCard
            key={item.id}
            index={index}
            item={item}
            selected={selectedId === item.id}
            view={view}
            onSelect={() => onSelect(item.id)}
            onToggleStar={() => onToggleStar(item)}
          />
        ))
      )}
    </div>
  );
}
