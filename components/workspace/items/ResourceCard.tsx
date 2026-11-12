"use client";

import { useRef } from "react";
import { FileText, Globe, Music, PlayCircle } from "lucide-react";
import type { ResourceCardNode } from "@/types/workspace";
import { useViewerStore } from "@/hooks/use-viewer-store";
import { isCardTap, resourceCardSubtitle, viewerTypeForCard } from "@/lib/workspace/resource-card";

const ICONS = {
  pdf: { Icon: FileText, tint: "bg-rose-50 text-rose-500" },
  video: { Icon: PlayCircle, tint: "bg-indigo-50 text-indigo-500" },
  audio: { Icon: Music, tint: "bg-amber-50 text-amber-600" },
  webpage: { Icon: Globe, tint: "bg-sky-50 text-sky-500" },
} as const;

/**
 * A whole PDF, video, audio file or webpage on the canvas. The whole card is
 * the drag handle; a short tap or click that does not move it opens the
 * floating viewer.
 * `canOpen` is false outside the select tool (connector tool, panning, …).
 */
export function ResourceCard({ item, canOpen }: { item: ResourceCardNode; canOpen: boolean }) {
  const press = useRef<{ pointerId: number; x: number; y: number; time: number } | null>(null);
  const { kind, title, assetId } = item.props;
  const { Icon, tint } = ICONS[kind];
  const label = title || resourceCardSubtitle(item.props);

  const open = () => {
    void useViewerStore.getState().open(assetId, viewerTypeForCard(kind), 1);
  };

  return (
    <div
      className="drag-handle flex h-full w-full cursor-pointer select-none items-center gap-3 bg-white px-3"
      data-resource-card={item.id}
      title={`Open ${label}`}
      onPointerDown={(event) => {
        press.current = event.isPrimary && event.button === 0 && !event.shiftKey && !event.metaKey && !event.ctrlKey
          ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp }
          : null;
      }}
      // Pointer events, not `click`: on touch screens the drag library cancels
      // `touchstart`, so iOS sends no click after a tap. A held press (the
      // long-press menu) or a drag is not a tap.
      onPointerUp={(event) => {
        const start = press.current;
        press.current = null;
        if (!canOpen || !start || start.pointerId !== event.pointerId) return;
        if (isCardTap(start, { x: event.clientX, y: event.clientY, time: event.timeStamp })) open();
      }}
      onPointerCancel={() => {
        press.current = null;
      }}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tint}`}>
        <Icon size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{label}</span>
        <span className="block truncate text-xs text-slate-500">{resourceCardSubtitle(item.props)}</span>
      </span>
    </div>
  );
}
