import { createHash } from "crypto";

/**
 * A rate-limit key for an email address that doesn't store the address
 * itself: a hash of it, trimmed and lower-cased.
 */
export function emailLimitKey(email: string): string {
  return `email:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32)}`;
}
