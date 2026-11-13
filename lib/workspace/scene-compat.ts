// ---------------------------------------------------------------------------
// Client build check for workspace snapshot saves
// ---------------------------------------------------------------------------
//
// A tab left open on an older build keeps autosaving. If that build cannot
// represent everything a newer build writes, its saves would lose data, so
// the server refuses saves from builds older than the minimum.
//
// When a release adds something an older build would lose on save, raise
// WORKSPACE_SCENE_CLIENT_BUILD and set MIN_WORKSPACE_SCENE_CLIENT_BUILD to it.

/** The scene build this client sends with every snapshot save. Build 2 knows `note-card`. */
export const WORKSPACE_SCENE_CLIENT_BUILD = 2;

/**
 * Saves from builds older than this are refused with 409. Raised to 2 with
 * `note-card`, so a tab still running an older build reloads before saving.
 */
export const MIN_WORKSPACE_SCENE_CLIENT_BUILD = 2;

/**
 * Builds from before this check send no `clientBuild`. They know exactly the
 * node types of build 1, so a missing value counts as 1.
 */
const BUILD_WITHOUT_CLIENT_BUILD = 1;

/** Error code in the 409 body, so the client can tell it from other failures. */
export const CLIENT_OUTDATED_CODE = "WORKSPACE_CLIENT_OUTDATED";

export function readClientBuild(value: unknown): number | null {
  if (value === undefined) return BUILD_WITHOUT_CLIENT_BUILD;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** True when a save that sent `value` as its `clientBuild` may be stored. */
export function isClientBuildAccepted(value: unknown, minimum = MIN_WORKSPACE_SCENE_CLIENT_BUILD): boolean {
  const build = readClientBuild(value);
  return build !== null && build >= minimum;
}
