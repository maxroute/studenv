// ---------------------------------------------------------------------------
// Note revision policy (design doc §4.2, approved)
// ---------------------------------------------------------------------------
//
// Checkpoints, not one revision per autosave: a save writes a checkpoint when
// at least 10 minutes have passed since the last revision. Retention: keep
// everything for 30 days, then one per day up to 180 days, then one per week,
// with a hard cap of 500 per note. Manual revisions are always kept.

export const CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000;
export const REVISION_CAP = 500;

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_ALL_MS = 30 * DAY_MS;
const DAILY_UNTIL_MS = 180 * DAY_MS;

export type RevisionStamp = { id: string; createdAt: Date; reason: string };

export function shouldCheckpoint(lastRevisionAt: Date | null, now: Date): boolean {
  return lastRevisionAt === null || now.getTime() - lastRevisionAt.getTime() >= CHECKPOINT_INTERVAL_MS;
}

/** Ids of revisions to delete, newest kept first within each period. */
export function revisionsToPrune(revisions: readonly RevisionStamp[], now: Date): string[] {
  const newestFirst = [...revisions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const kept: RevisionStamp[] = [];
  const prune = new Set<string>();
  const seenBuckets = new Set<string>();

  for (const revision of newestFirst) {
    const age = now.getTime() - revision.createdAt.getTime();
    if (revision.reason === "manual" || age < KEEP_ALL_MS) {
      kept.push(revision);
      continue;
    }
    const day = Math.floor(revision.createdAt.getTime() / DAY_MS);
    const bucket = age < DAILY_UNTIL_MS ? `d${day}` : `w${Math.floor(day / 7)}`;
    if (seenBuckets.has(bucket)) {
      prune.add(revision.id);
    } else {
      seenBuckets.add(bucket);
      kept.push(revision);
    }
  }

  // Hard cap: drop the oldest non-manual revisions beyond it.
  let excess = kept.length - REVISION_CAP;
  for (let i = kept.length - 1; i >= 0 && excess > 0; i -= 1) {
    if (kept[i].reason === "manual") continue;
    prune.add(kept[i].id);
    excess -= 1;
  }
  return [...prune];
}
