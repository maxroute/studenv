"use client";

import { useRef } from "react";
import { FileText } from "lucide-react";
import type { NoteCardNode } from "@/types/workspace";
import { useNotePanelStore } from "@/hooks/use-note-panel-store";
import { isCardTap } from "@/lib/workspace/resource-card";

/**
 * A page from Notes on the canvas. The whole card is the drag handle; a short
 * tap or click that does not move it opens the note in the side panel.
 * `canOpen` is false outside the select tool (connector tool, panning, …).
 */
export function NoteCard({ item, canOpen }: { item: NoteCardNode; canOpen: boolean }) {
  const press = useRef<{ pointerId: number; x: number; y: number; time: number } | null>(null);
  const { title, excerpt, noteId } = item.props;

  return (
    <div
      className="drag-handle flex h-full w-full cursor-pointer select-none flex-col gap-1.5 overflow-hidden bg-white px-3 py-2.5"
      data-note-card={item.id}
      title={`Open ${title || "note"}`}
      onPointerDown={(event) => {
        press.current = event.isPrimary && event.button === 0 && !event.shiftKey && !event.metaKey && !event.ctrlKey
          ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp }
          : null;
      }}
      // Pointer events, not `click`: on touch screens the drag library cancels
      // `touchstart`, so iOS sends no click after a tap (same as resource cards).
      onPointerUp={(event) => {
        const start = press.current;
        press.current = null;
        if (!canOpen || !start || start.pointerId !== event.pointerId) return;
        if (isCardTap(start, { x: event.clientX, y: event.clientY, time: event.timeStamp })) useNotePanelStore.getState().open(noteId);
      }}
      onPointerCancel={() => {
        press.current = null;
      }}
    >
      <span className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-500">
          <FileText size={16} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{title || "Untitled"}</span>
      </span>
      <span className="line-clamp-4 text-xs leading-relaxed text-slate-500">{excerpt || "Empty note"}</span>
    </div>
  );
}
