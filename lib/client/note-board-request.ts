// ---------------------------------------------------------------------------
// Opening a page's board: the request starts at the click
// ---------------------------------------------------------------------------
//
// The Board button navigates to the loading screen, which then asks the server
// for the board. The navigation itself (a server round trip for the loading
// screen's code) used to finish first, so the request started late and the
// click showed nothing meanwhile. Starting the request at the click lets it
// run alongside the navigation; the loading screen picks up the same request.

import { mutate } from "swr";

export type OpenedBoard = { workspaceId: string; preload: Record<string, unknown>; nextUrl: string };

/** A request this recent, made by a click, is the one the loading screen should use. */
const REUSE_MS = 20_000;

const started = new Map<string, { promise: Promise<OpenedBoard>; at: number }>();

async function requestBoard(noteId: string): Promise<OpenedBoard> {
  const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/board`, { method: "POST" });
  const json = await res.json().catch(() => null);
  const data = json?.data;
  if (!res.ok || typeof data?.workspaceId !== "string" || !data.workspace) {
    throw new Error(typeof json?.error === "string" ? json.error : "The board could not be opened.");
  }
  if (data.card) void mutate(`/api/notes/${encodeURIComponent(noteId)}/card`, data.card, { revalidate: false });
  return {
    workspaceId: data.workspaceId,
    preload: { ...data.workspace, noteCard: data.note ?? null, preloadedAt: Date.now() },
    nextUrl: `/workspaces/${encodeURIComponent(data.workspaceId)}?addNote=${encodeURIComponent(noteId)}`,
  };
}

/** Starts opening the page's board now (or joins a request already under way). */
export function startOpeningNoteBoard(noteId: string): Promise<OpenedBoard> {
  const existing = started.get(noteId);
  if (existing && Date.now() - existing.at < REUSE_MS) return existing.promise;
  const promise = requestBoard(noteId);
  const entry = { promise, at: Date.now() };
  started.set(noteId, entry);
  // A failed request is forgotten so "Try again" asks afresh; nobody waiting is not an error.
  promise.catch(() => {
    if (started.get(noteId) === entry) started.delete(noteId);
  });
  return promise;
}

/** The board request for the loading screen: the one a click started, or a new one. Used once. */
export function takeNoteBoardRequest(noteId: string): Promise<OpenedBoard> {
  const promise = startOpeningNoteBoard(noteId);
  started.delete(noteId);
  return promise;
}
