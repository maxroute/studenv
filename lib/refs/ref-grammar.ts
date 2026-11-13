// ---------------------------------------------------------------------------
// Reference grammar: `<type>:<id>[#<anchor>]`
// ---------------------------------------------------------------------------
//
// FROZEN once the first reference is stored. Every stored reference must keep
// parsing forever, so this file never changes meaning: new kinds of target are
// added in the type registry (`ref-types.ts`), never here.
//
// The grammar treats `id` and `anchor` as opaque. Only a type's registry entry
// interprets them. Percent-encoding (`%XX`) lets ids from other systems contain
// characters such as `/`, `:` or `#` without a grammar change.
//
// Pure: no imports beyond zod, so it runs on the client, server, worker and in tests.

import { z } from "zod";

/** Longest canonical reference string; matches the VarChar(420) columns that store one. */
export const REF_MAX_LENGTH = 420;

const TYPE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
// Hex digits are accepted in either case on input; the canonical form is uppercase.
const ID_PATTERN = /^(?:[A-Za-z0-9_.~-]|%[0-9A-Fa-f]{2}){1,128}$/;
const ANCHOR_PATTERN = /^(?:[A-Za-z0-9_.~=:,-]|%[0-9A-Fa-f]{2}){1,256}$/;

const ID_CHAR = /^[A-Za-z0-9_.~-]$/;
const ANCHOR_CHAR = /^[A-Za-z0-9_.~=:,-]$/;

export type RefPart = "id" | "anchor";

const partChar = (part: RefPart) => (part === "id" ? ID_CHAR : ANCHOR_CHAR);

/** True when `value` is a well-formed reference type name. */
export function isRefTypeName(value: string): boolean {
  return TYPE_PATTERN.test(value);
}

const RefShapeSchema = z.object({
  type: z.string().regex(TYPE_PATTERN), // deliberately not an enum: unknown types are valid
  id: z.string().regex(ID_PATTERN),
  anchor: z.string().regex(ANCHOR_PATTERN).optional(),
});

export type Ref = z.infer<typeof RefShapeSchema>;

/**
 * Minimum encoding with uppercase hex: an escape for a character the part
 * allows is decoded, every other escape is kept with uppercase hex. Two
 * spellings of the same reference therefore canonicalise to one string.
 */
function canonicalizePart(value: string, part: RefPart): string {
  const allowed = partChar(part);
  return value.replace(/%([0-9A-Fa-f]{2})/g, (_escape, hex: string) => {
    const char = String.fromCharCode(Number.parseInt(hex, 16));
    return allowed.test(char) ? char : `%${hex.toUpperCase()}`;
  });
}

export function canonicalizeRef(ref: Ref): Ref {
  const canonical: Ref = { type: ref.type, id: canonicalizePart(ref.id, "id") };
  if (ref.anchor !== undefined) canonical.anchor = canonicalizePart(ref.anchor, "anchor");
  return canonical;
}

function joinRef(ref: Ref): string {
  return `${ref.type}:${ref.id}${ref.anchor !== undefined ? `#${ref.anchor}` : ""}`;
}

/** A reference object, valid only if its canonical string fits {@link REF_MAX_LENGTH}. */
export const RefSchema = RefShapeSchema.refine(
  (ref) => joinRef(canonicalizeRef(ref)).length <= REF_MAX_LENGTH,
  { message: `A reference is at most ${REF_MAX_LENGTH} characters` },
);

/** Parses a reference string and returns it canonicalised. Unknown types are accepted. */
export const RefStringSchema = z
  .string()
  .max(REF_MAX_LENGTH)
  .transform((value, ctx) => {
    const match = /^([^:#]+):([^#]+)(?:#(.+))?$/.exec(value);
    const parsed = match ? RefShapeSchema.safeParse({ type: match[1], id: match[2], anchor: match[3] }) : null;
    if (!parsed?.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid reference" });
      return z.NEVER;
    }
    return canonicalizeRef(parsed.data);
  });

/** The canonical reference, or null when `value` is not a valid reference string. */
export function parseRef(value: unknown): Ref | null {
  const parsed = RefStringSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Always writes the canonical form. */
export function formatRef(ref: Ref): string {
  return joinRef(canonicalizeRef(ref));
}

/**
 * Encodes a raw value (for example an external id containing `/`) as an id
 * or anchor in canonical form: allowed characters stay, every other UTF-8
 * byte becomes `%XX`. Does not check the length limits.
 */
export function encodeRefPart(raw: string, part: RefPart): string {
  const allowed = partChar(part);
  let encoded = "";
  for (const char of raw) {
    if (allowed.test(char)) {
      encoded += char;
      continue;
    }
    for (const byte of new TextEncoder().encode(char)) {
      encoded += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return encoded;
}

/** The raw value of an encoded id or anchor, or null when its escapes are not valid UTF-8. */
export function decodeRefPart(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}
