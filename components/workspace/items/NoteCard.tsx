"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import { ArrowRight, CheckSquare, FileText, Film, Globe, Image as ImageIcon, Music, Square, StickyNote } from "lucide-react";
import type { NoteCardNode } from "@/types/workspace";
import type { PreviewBlock } from "@/lib/notes/note-summary";
import { useNotePanelStore } from "@/hooks/use-note-panel-store";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { isCardTap } from "@/lib/workspace/resource-card";
import { LEGACY_NOTE_CARD_SIZE, NOTE_CARD_SIZE } from "@/lib/workspace/note-card";

type PageCard = {
  title: string;
  updatedAt: string;
  status: "unread" | "reading" | "done" | null;
  tags: string[];
  todos: { done: number; total: number };
  preview: PreviewBlock[];
  resources: Record<string, { kind: string; title: string }>;
};

async function cardFetcher(url: string): Promise<PageCard> {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error("Not available");
  return json.data as PageCard;
}

const STATUS: Record<string, { label: string; className: string }> = {
  unread: { label: "Unread", className: "border-slate-200 text-slate-500" },
  reading: { label: "Reading", className: "border-amber-200 bg-amber-50 text-amber-700" },
  done: { label: "Done", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

function ResourceIcon({ kind }: { kind: string }) {
  const props = { size: 13, className: "shrink-0" };
  if (kind === "pdf") return <FileText {...props} className="shrink-0 text-rose-500" />;
  if (kind === "video") return <Film {...props} className="shrink-0 text-indigo-500" />;
  if (kind === "image") return <ImageIcon {...props} className="shrink-0 text-emerald-500" />;
  if (kind === "audio") return <Music {...props} className="shrink-0 text-amber-600" />;
  if (kind === "page") return <StickyNote {...props} className="shrink-0 text-violet-500" />;
  return <Globe {...props} className="shrink-0 text-sky-500" />;
}

function edited(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Edited just now";
  if (minutes < 60) return `Edited ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  return `Edited ${new Date(iso).toLocaleDateString()}`;
}

/** The page's first blocks, styled the way they read on the page. */
function Preview({ blocks, resources }: { blocks: PreviewBlock[]; resources: PageCard["resources"] }) {
  return (
    <div className="flex flex-col gap-1 text-[12px] leading-snug text-slate-600">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return (
              <p key={index} className={`truncate font-semibold text-slate-800 ${block.level === 1 ? "text-[15px]" : block.level === 2 ? "text-[13.5px]" : "text-[12.5px]"}`}>
                {block.text}
              </p>
            );
          case "todo":
            return (
              <p key={index} className={`flex items-start gap-1.5 ${block.checked ? "text-slate-400 line-through" : ""}`}>
                {block.checked ? <CheckSquare size={13} className="mt-px shrink-0 text-amber-500" /> : <Square size={13} className="mt-px shrink-0 text-slate-400" />}
                <span className="line-clamp-2">{block.text}</span>
              </p>
            );
          case "bullet":
            return (
              <p key={index} className="flex items-start gap-1.5">
                <span className="mt-[1px] shrink-0 text-slate-400">{block.ordered ? "1." : "•"}</span>
                <span className="line-clamp-2">{block.text}</span>
              </p>
            );
          case "quote":
            return <p key={index} className="line-clamp-2 border-l-2 border-slate-200 pl-2 italic">{block.text}</p>;
          case "callout":
            return <p key={index} className="line-clamp-2 rounded-md bg-sky-50 px-2 py-1 text-slate-700">{block.text}</p>;
          case "code":
            return <p key={index} className="truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">{block.text}</p>;
          case "divider":
            return <hr key={index} className="my-1 border-slate-200" />;
          case "resource": {
            const resource = resources[block.ref];
            return (
              <p key={index} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                <ResourceIcon kind={resource?.kind ?? "link"} />
                <span className="truncate">{resource?.title ?? "Resource"}</span>
              </p>
            );
          }
          case "pdfPage":
            return (
              <p key={index} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                <ResourceIcon kind="pdf" />
                <span className="truncate">{block.title} · page {block.page}</span>
              </p>
            );
          default:
            return <p key={index} className="line-clamp-3">{block.text}</p>;
        }
      })}
    </div>
  );
}

/**
 * A page on the canvas, shown as it reads: its first blocks, status, tags and
 * resources. The whole card is the drag handle; a short tap or click that does
 * not move it opens the page in the side panel for editing.
 * `canOpen` is false outside the select tool (connector tool, panning, …).
 */
export function NoteCard({ item, canOpen }: { item: NoteCardNode; canOpen: boolean }) {
  const press = useRef<{ pointerId: number; x: number; y: number; time: number } | null>(null);
  const { title, excerpt, noteId } = item.props;
  // Refreshed when the side panel closes, so edits made there show on the card.
  const { data, mutate } = useSWR(`/api/notes/${encodeURIComponent(noteId)}/card`, cardFetcher, { dedupingInterval: 2000 });
  const panelNoteId = useNotePanelStore((state) => state.noteId);
  useEffect(() => {
    if (panelNoteId === null) void mutate();
  }, [mutate, panelNoteId]);

  // Cards made before they showed the page are too small for it: grow them once (not an undo step).
  useEffect(() => {
    if (item.w !== LEGACY_NOTE_CARD_SIZE.w || item.h !== LEGACY_NOTE_CARD_SIZE.h) return;
    const store = useWorkspaceStore.getState();
    store.updateItems(
      store.items.map((entry) => (entry.id === item.id ? { ...entry, w: NOTE_CARD_SIZE.w, h: NOTE_CARD_SIZE.h } : entry)),
      { recordHistory: false },
    );
  }, [item.h, item.id, item.w]);

  const status = data?.status ? STATUS[data.status] : null;
  const resourceCounts = data
    ? Object.values(data.resources).reduce<Record<string, number>>((counts, resource) => ({ ...counts, [resource.kind]: (counts[resource.kind] ?? 0) + 1 }), {})
    : {};

  return (
    <div
      className="group drag-handle flex h-full w-full cursor-pointer select-none flex-col overflow-hidden bg-white"
      data-note-card={item.id}
      title={`Open ${title || "page"}`}
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
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-500">
          <StickyNote size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-slate-800">{data?.title ?? (title || "Untitled")}</span>
        {status ? <span className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium ${status.className}`}>{status.label}</span> : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden px-3 pt-2">
        {data ? (
          data.preview.length ? <Preview blocks={data.preview} resources={data.resources} /> : <p className="text-[12px] italic text-slate-400">Empty page</p>
        ) : (
          <p className="line-clamp-6 text-[12px] leading-snug text-slate-500">{excerpt || "Empty page"}</p>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
      </div>

      {data && (data.tags.length || data.todos.total || Object.keys(resourceCounts).length) ? (
        <div className="flex flex-wrap items-center gap-1 px-3 pt-1.5">
          {data.todos.total ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-px text-[10px] text-slate-600">
              <CheckSquare size={10} /> {data.todos.done}/{data.todos.total}
            </span>
          ) : null}
          {Object.entries(resourceCounts).map(([kind, count]) => (
            <span key={kind} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-px text-[10px] text-slate-600">
              <ResourceIcon kind={kind} /> {count} {kind === "pdf" ? "PDF" : kind}{count > 1 && kind !== "pdf" ? "s" : ""}
            </span>
          ))}
          {data.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-violet-50 px-1.5 py-px text-[10px] text-violet-600">#{tag}</span>
          ))}
        </div>
      ) : null}

      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-1.5 text-[10.5px] text-slate-400">
        <span className="truncate">{data ? edited(data.updatedAt) : " "}</span>
        <span className="note-card-hint inline-flex shrink-0 items-center gap-1 font-medium text-indigo-600">
          Click to open and edit <ArrowRight size={11} />
        </span>
      </div>
    </div>
  );
}
