import { createHash } from "node:crypto";
import { linkRowKey, type LinkRow } from "./link-rows";

/** Stable hash of a link set: equal sets give equal hashes, whatever their order. Server only. */
export function linkSetHash(rows: readonly LinkRow[]): string {
  const hash = createHash("sha256");
  for (const key of rows.map(linkRowKey).sort()) hash.update(key).update("\n");
  return hash.digest("hex");
}
