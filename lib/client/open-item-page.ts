"use client";

import toast from "react-hot-toast";

/** Opens the page of a Shelf item (creating a resource's page on first use). */
export async function openItemPage(item: { id: string; noteId?: string | null }, navigate: (url: string) => void) {
  if (item.noteId) {
    navigate(`/notes/${encodeURIComponent(item.noteId)}`);
    return;
  }
  const response = await fetch(`/api/items/${encodeURIComponent(item.id)}/page`, { method: "POST" });
  const json = await response.json().catch(() => null);
  const noteId = json?.data?.noteId;
  if (!response.ok || typeof noteId !== "string") {
    toast.error(typeof json?.error === "string" ? json.error : "The page could not be opened.");
    return;
  }
  navigate(`/notes/${encodeURIComponent(noteId)}`);
}
