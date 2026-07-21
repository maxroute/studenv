import type {
  CreateCollectionInput,
  UpdateCollectionInput,
} from "@/lib/models/collection.model";
import type {
  CreateItemInput,
  UpdateItemInput,
} from "@/lib/models/item.model";
import type { UpdateProfileInput } from "@/lib/models/user.model";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^.+\.local$/i,
  /^.+\.internal$/i,
];

export function sanitizeText(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  return input
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeRichText(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  return input.replace(/<[^>]*>/g, "").trim();
}

export function sanitizeTagName(input: string) {
  const normalized = sanitizeText(input)
    ?.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized) {
    throw new Error("Invalid tag name.");
  }

  return normalized;
}

function dedupeValues(values: string[]) {
  return [...new Set(values)];
}

function sanitizeOptionalIds(input: string[] | undefined) {
  if (input === undefined) {
    return undefined;
  }

  return dedupeValues(
    input.map((value) => sanitizeText(value) ?? "").filter(Boolean),
  );
}

export function sanitizeUrl(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  const candidate = input.startsWith("http") ? input : `https://${input}`;
  const parsed = new URL(candidate);

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("URL protocol is not allowed.");
  }

  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname))) {
    throw new Error("URL host is not allowed.");
  }

  if (
    /^127\./.test(parsed.hostname) ||
    /^10\./.test(parsed.hostname) ||
    /^192\.168\./.test(parsed.hostname) ||
    /^169\.254\./.test(parsed.hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(parsed.hostname)
  ) {
    throw new Error("Private network URLs are not allowed.");
  }

  return parsed.toString();
}

export function sanitizeAvatarUrl(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  const trimmed = sanitizeText(input);

  if (!trimmed) {
    return null;
  }

  if (/^\/uploads\/avatars\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|gif|webp)$/i.test(trimmed)) {
    return trimmed;
  }

  return sanitizeUrl(trimmed);
}

function sanitizeOptionalText(input: string | null | undefined) {
  if (input === undefined) {
    return undefined;
  }

  return sanitizeText(input);
}

function sanitizeOptionalRichText(input: string | null | undefined) {
  if (input === undefined) {
    return undefined;
  }

  return sanitizeRichText(input);
}

function sanitizeOptionalUrl(input: string | null | undefined) {
  if (input === undefined) {
    return undefined;
  }

  return sanitizeUrl(input);
}

export function sanitizeItemInput<T extends CreateItemInput | UpdateItemInput>(
  input: T,
) {
  const tags = input.tags?.map(sanitizeTagName);

  return {
    ...input,
    title: sanitizeOptionalText(input.title),
    url: sanitizeOptionalUrl(input.url),
    excerpt: sanitizeOptionalText(input.excerpt),
    notes: sanitizeOptionalRichText(input.notes),
    tags: tags ? dedupeValues(tags) : undefined,
  };
}

export function sanitizeCollectionInput<
  T extends CreateCollectionInput | UpdateCollectionInput,
>(input: T) {
  return {
    ...input,
    title: sanitizeOptionalText(input.title),
    description: sanitizeOptionalText(input.description),
    itemIds: sanitizeOptionalIds(input.itemIds),
  };
}

export function sanitizeProfileInput(input: UpdateProfileInput) {
  return {
    ...input,
    name: sanitizeText(input.name),
    username: sanitizeTagName(input.username),
    bio: sanitizeText(input.bio),
    avatarUrl: sanitizeAvatarUrl(input.avatarUrl),
  };
}
