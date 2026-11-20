"use client";

import { isYouTubeUrl } from "@/lib/utils/youtube";

// After a YouTube video is saved, the browser asks the server to save its
// transcript so Rangan can search and summarize it. Fire and forget: saving
// the video never waits for or fails because of this.

/** Retried once after this long when YouTube failed in a way that may pass. */
const RETRY_DELAY_MS = 5_000;

async function postTranscript(assetId: string) {
  const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/transcript`, { method: "POST" });
  if (!response.ok) throw new Error(`Saving the video's transcript failed (${response.status}).`);
  const json: unknown = await response.json().catch(() => null);
  const data = json && typeof json === "object" && "data" in json ? json.data : null;
  return data && typeof data === "object" && "reason" in data ? data.reason : null;
}

async function transcriptForAsset(assetId: string) {
  const reason = await postTranscript(assetId);
  if (reason === "error" || reason === "blocked") {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    await postTranscript(assetId);
  }
}

async function transcriptForItem(itemId: string) {
  // A Shelf item gets the asset its transcript belongs to (created on first use).
  const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/asset`, { method: "POST" });
  const json: unknown = await response.json().catch(() => null);
  const data = json && typeof json === "object" && "data" in json ? json.data : null;
  const assetId = data && typeof data === "object" && "assetId" in data ? data.assetId : null;
  if (!response.ok || typeof assetId !== "string") throw new Error(`Finding the video failed (${response.status}).`);
  await transcriptForAsset(assetId);
}

/** Asks for the transcript of a saved YouTube video, by its Shelf item or its asset. Does nothing for other links. */
export function requestVideoTranscript(target: { itemId: string } | { assetId: string }, url: string | null | undefined) {
  if (!isYouTubeUrl(url)) return;
  const work = "itemId" in target ? transcriptForItem(target.itemId) : transcriptForAsset(target.assetId);
  work.catch((error) => {
    console.error("Could not save the video's transcript:", error);
  });
}
