/**
 * Saves transcripts (AiAnalysis.transcript) for YouTube videos that have
 * none, so Rangan can search and summarize them. Videos saved from now on get
 * theirs from the browser; this covers ones saved before. Idempotent: a video
 * with a saved transcript is skipped.
 *
 *   npx tsx --env-file=<.env> --env-file=<.env.local> scripts/backfill-video-transcripts.ts                 # dry run: lists videos only
 *   npx tsx --env-file=... scripts/backfill-video-transcripts.ts --owner=<userId>                           # one user's videos
 *   npx tsx --env-file=... scripts/backfill-video-transcripts.ts --apply '--confirm-host=<host shown by the dry run>'
 *
 * WRITES TO THE DATABASE with --apply (CLAUDE.md §11): it creates the
 * MediaAsset a Shelf video item is missing (as opening the item would) and
 * creates or updates AiAnalysis rows with the transcript. It fetches captions
 * from YouTube, one video every few seconds. It prints the redacted database
 * host and refuses to write unless --confirm-host matches.
 */
import { prisma } from "@/lib/db/prisma";
import { getOrCreateAssetForItem } from "@/lib/services/item-asset.service";
import { ensureVideoTranscript } from "@/lib/services/video-transcript.server";
import { hasUsableTranscript } from "@/lib/utils/video-transcript";
import { getYouTubeVideoId } from "@/lib/utils/youtube";

/** Pause between videos, so YouTube does not throttle the run. */
const PAUSE_MS = 2_000;

function redactedHost(url: string | undefined) {
  try {
    return new URL(url ?? "").hostname.replace(/^ep-[a-z0-9-]+?(-pooler)?\./, "ep-***$1.");
  } catch {
    return "unknown";
  }
}

const argValue = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

type Candidate = { ownerId: string; title: string; itemId: string | null; assetId: string | null };

async function listCandidates(ownerId: string | undefined): Promise<Candidate[]> {
  const owner = ownerId ? { ownerId } : {};
  const assets = await prisma.mediaAsset.findMany({
    where: { kind: "video", sourceUrl: { not: null }, ...owner },
    select: { id: true, ownerId: true, itemId: true, title: true, sourceUrl: true, aiAnalysis: { select: { transcript: true } } },
    orderBy: { createdAt: "asc" },
  });
  const items = await prisma.item.findMany({
    where: { type: "video", url: { not: null }, ...(ownerId ? { userId: ownerId } : {}) },
    select: { id: true, userId: true, title: true, url: true },
    orderBy: { createdAt: "asc" },
  });

  const itemsWithAsset = new Set(assets.flatMap((asset) => (asset.itemId ? [asset.itemId] : [])));
  return [
    ...assets
      .filter((asset) => getYouTubeVideoId(asset.sourceUrl) && !hasUsableTranscript(asset.aiAnalysis?.transcript))
      .map((asset) => ({ ownerId: asset.ownerId, title: asset.title, itemId: asset.itemId, assetId: asset.id })),
    ...items
      .filter((item) => getYouTubeVideoId(item.url) && !itemsWithAsset.has(item.id))
      .map((item) => ({ ownerId: item.userId, title: item.title, itemId: item.id, assetId: null })),
  ];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirm = argValue("confirm-host");
  const ownerId = argValue("owner");
  const host = redactedHost(process.env.DATABASE_URL);
  console.log(`Target database host: ${host}`);
  console.log(apply ? "Mode: APPLY (writes)" : "Mode: dry run (read-only)");
  if (apply && confirm !== host) {
    console.error(`Refusing to write: pass --confirm-host=${host} to confirm this target.`);
    process.exitCode = 1;
    return;
  }

  const candidates = await listCandidates(ownerId);
  console.log(`YouTube videos without a transcript${ownerId ? " for that user" : ""}: ${candidates.length}`);
  for (const video of candidates) {
    console.log(`  ${video.assetId ? `asset ${video.assetId}` : `item  ${video.itemId} (no asset yet)`}  ${video.title.slice(0, 60)}`);
  }
  if (!apply) return;

  const counts = { saved: 0, unavailable: 0, failed: 0 };
  for (const video of candidates) {
    const label = video.assetId ?? video.itemId;
    try {
      const assetId = video.assetId ?? (video.itemId ? (await getOrCreateAssetForItem(video.itemId, video.ownerId)).id : null);
      if (!assetId) continue;
      const result = await ensureVideoTranscript(video.ownerId, assetId);
      if (result.status === "saved" || result.status === "exists") counts.saved += 1;
      else counts.unavailable += 1;
      console.log(`  ${result.status === "saved" ? "✓" : "–"} ${label}: ${JSON.stringify(result)}`);
    } catch (error) {
      counts.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ${label}: ${message.replace(/postgres(ql)?:\/\/\S+/g, "***")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
  console.log(`Done: ${counts.saved} with a transcript, ${counts.unavailable} without captions or blocked, ${counts.failed} failed.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "***") : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
