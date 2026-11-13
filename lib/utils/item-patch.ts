import type { ItemRecord } from "@/types";

/** Fields the client may send in `PUT /api/items/[id]` (see `updateItemSchema`). */
const SCALAR_FIELDS = ["title", "type", "url", "excerpt", "notes", "status", "starred"] as const;

export type ItemUpdatePayload = Partial<Pick<ItemRecord, (typeof SCALAR_FIELDS)[number]>> & {
  tags?: string[];
};

function tagNames(tags: ItemRecord["tags"]) {
  return [...new Set(tags.map((tag) => tag.name))];
}

/**
 * Builds the body for `PUT /api/items/[id]` from only the fields the caller
 * changed. The server treats an absent field as "unchanged", so a field that
 * is not part of `changes` must never be sent: list rows carry `notes: null`
 * and a shortened `excerpt`, and echoing them back would overwrite the stored
 * values. Fields whose value did not change are left out too.
 */
export function buildItemUpdatePayload(
  current: ItemRecord,
  changes: Partial<ItemRecord>,
): ItemUpdatePayload {
  const payload: ItemUpdatePayload = {};

  for (const field of SCALAR_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(changes, field)) continue;
    const next = changes[field];
    if (next === undefined || next === current[field]) continue;
    Object.assign(payload, { [field]: next });
  }

  if (Object.prototype.hasOwnProperty.call(changes, "tags") && Array.isArray(changes.tags)) {
    const next = tagNames(changes.tags);
    const previous = tagNames(current.tags);
    const same = next.length === previous.length && next.every((name, index) => name === previous[index]);
    if (!same) payload.tags = next;
  }

  return payload;
}
