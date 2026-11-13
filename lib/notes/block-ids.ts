// ---------------------------------------------------------------------------
// Note block ids: `b_` plus 10 URL-safe characters
// ---------------------------------------------------------------------------
//
// Every block node carries one. Ids are permanent: a split keeps the first
// half's id, a merge keeps the survivor's, paste and duplicate get fresh ids,
// and a retired id is never reused. References point at blocks through them
// (`note:<id>#b_…`).

export const BLOCK_ID_PATTERN = /^b_[A-Za-z0-9_-]{10}$/;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function isBlockId(value: unknown): value is string {
  return typeof value === "string" && BLOCK_ID_PATTERN.test(value);
}

/** A new random block id (64^10 possibilities). */
export function generateBlockId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let id = "b_";
  for (const byte of bytes) id += ALPHABET[byte & 63];
  return id;
}
