// ---------------------------------------------------------------------------
// Fractional sort keys for sibling order in the page tree
// ---------------------------------------------------------------------------
//
// A key is a non-empty string over 0-9A-Za-z (ASCII order) that never ends in
// "0". Any two different keys have a key between them, so moving a page only
// rewrites that page's key.

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY_PATTERN = /^[0-9A-Za-z]*[1-9A-Za-z]$/;

export function isSortKey(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && KEY_PATTERN.test(value);
}

/** A key strictly between `a` and `b`; `a` "" means the start, `b` null means the end. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    // Shared prefix: recurse on the parts after it.
    let n = 0;
    while ((a[n] ?? "0") === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (digitB - digitA > 1) return DIGITS[Math.round((digitA + digitB) / 2)];
  // Adjacent first digits.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

/** A key that sorts after `before` and before `after` (either may be null). */
export function sortKeyBetween(before: string | null, after: string | null): string {
  if (before !== null && !isSortKey(before)) throw new RangeError(`Invalid sort key "${before}"`);
  if (after !== null && !isSortKey(after)) throw new RangeError(`Invalid sort key "${after}"`);
  if (before !== null && after !== null && before >= after) {
    throw new RangeError(`Sort key "${before}" is not before "${after}"`);
  }
  return midpoint(before ?? "", after);
}
