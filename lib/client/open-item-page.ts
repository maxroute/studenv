"use client";

import toast from "react-hot-toast";
import { finishNavigation, startNavigation } from "@/lib/client/navigation-progress";

/** Opens the page of a Shelf item (creating a resource's page on first use). */
export async function openItemPage(item: { id: string; noteId?: string | null }, navigate: (url: string) => void) {
  // Shown from the click: the page may first need creating, then loading.
  if (item.noteId) {
    startNavigation(`/notes/${encodeURIComponent(item.noteId)}`);
    navigate(`/notes/${encodeURIComponent(item.noteId)}`);
    return;
  }
  startNavigation();
  const response = await fetch(`/api/items/${encodeURIComponent(item.id)}/page`, { method: "POST" }).catch(() => null);
  const json = await response?.json().catch(() => null);
  const noteId = json?.data?.noteId;
  if (!response?.ok || typeof noteId !== "string") {
    finishNavigation();
    toast.error(typeof json?.error === "string" ? json.error : "The page could not be opened.");
    return;
  }
  const target = `/notes/${encodeURIComponent(noteId)}`;
  // Already there: nothing will change the address, so nothing is loading.
  if (window.location.pathname === target) finishNavigation();
  navigate(target);
}
