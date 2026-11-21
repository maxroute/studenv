"use client";

import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import type { RanganMap } from "@/lib/services/rangan.service";
import { applyBoardPlan, boardSummary, type BoardChange, type BoardSummary } from "@/lib/workspace/board-edit";
import { useSelectionStore } from "@/lib/workspace/selection-engine";

// Creating a map board Rangan drafted, and applying additions Rangan
// suggested to the open board. Both happen only when the student taps the
// button for them.

/** The board in front of the student: the /workspaces/<id> page whose board is loaded. */
export function openBoard(): { id: string; title: string } | null {
  if (typeof window === "undefined") return null;
  const match = /^\/workspaces\/([^/?#]+)/.exec(window.location.pathname);
  const { workspaceId, title, isLoading } = useWorkspaceStore.getState();
  if (!match || isLoading || !workspaceId || decodeURIComponent(match[1]) !== workspaceId) return null;
  return { id: workspaceId, title: title || "Untitled board" };
}

/** The open board described by short keys, with the ids kept to apply a plan later. */
export function openBoardSummary(): BoardSummary {
  return boardSummary(useWorkspaceStore.getState().items, useSelectionStore.getState().selectedIds);
}

/** Creates a new board with the map laid out on it, linked to the page written with it when there is one. */
export async function createMapBoard(map: RanganMap, pageNoteId?: string | null): Promise<{ ok: true; workspaceId: string } | { ok: false; message: string }> {
  try {
    const response = await fetch("/api/rangan/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft: map.draft,
        sources: map.sources.map((source) => ({ n: source.n, ref: source.ref })),
        ...(pageNoteId ? { pageNoteId } : {}),
      }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || typeof json?.data?.workspaceId !== "string") return { ok: false, message: json?.error ?? "The board could not be created." };
    return { ok: true, workspaceId: json.data.workspaceId };
  } catch {
    return { ok: false, message: "You seem to be offline. Check your connection and try again." };
  }
}

const newId = () => `item-${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

/**
 * Adds the approved additions to the open board as one undo step, then
 * selects them so the student sees what was added. Refuses when that board
 * isn't open or something the plan uses has been deleted since.
 */
export function applyBoardEdit(boardRef: string, changes: readonly BoardChange[], planned: BoardSummary): { ok: true; added: number } | { ok: false; message: string } {
  const board = openBoard();
  if (!board || `workspace:${board.id}` !== boardRef) return { ok: false, message: "Open that board to apply this." };
  const store = useWorkspaceStore.getState();
  const { viewport } = store;
  const viewportCentre = { x: (-viewport.x + window.innerWidth / 2) / viewport.zoom, y: (-viewport.y + window.innerHeight / 2) / viewport.zoom };
  const result = applyBoardPlan(store.items, changes, planned, { newId, viewportCentre });
  if (!result) return { ok: false, message: "Something this uses was removed from the board. Ask Rangan again." };
  store.breakHistoryCapture();
  store.updateItems(result.items);
  useSelectionStore.getState().clearAndSelectIds(result.addedIds.filter((id) => result.items.find((item) => item.id === id)?.type !== "connector"));
  return { ok: true, added: result.addedIds.length };
}
