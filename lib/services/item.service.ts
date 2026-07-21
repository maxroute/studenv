import { siteConfig } from "@/config/site";
import type {
  CreateItemInput,
  ItemQueryInput,
  TagInput,
  UpdateItemInput,
} from "@/lib/models/item.model";
import * as itemRepository from "@/lib/repositories/item.repository";
import { auditLog } from "@/lib/repositories/base.repository";
import {
  sanitizeItemInput,
  sanitizeTagName,
  sanitizeUrl,
} from "@/lib/security/sanitize";
import { inferItemTypeFromUrl } from "@/lib/utils/item-type";
import type { Plan } from "@/types";

function getSourceHost(url?: string | null) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function resolveItemType(
  type: CreateItemInput["type"] | UpdateItemInput["type"] | undefined,
  url?: string | null,
) {
  if (type) {
    return type;
  }

  const inferred = inferItemTypeFromUrl(url);
  return inferred ?? "article";
}

function hasOwn<T extends object>(value: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export async function listItems(userId: string, query: ItemQueryInput) {
  const safeQuery = {
    ...query,
    q: query.q?.trim(),
    tag: query.tag ? sanitizeTagName(query.tag) : undefined,
  };

  return itemRepository.findAll(userId, safeQuery);
}

export async function getItem(userId: string, id: string) {
  const item = await itemRepository.findById(id, userId);

  if (!item) {
    const error = new Error("Item not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  return item;
}

export async function createItem(
  userId: string,
  plan: Plan,
  input: CreateItemInput,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  if (plan === "free") {
    const currentCount = await itemRepository.countByUserId(userId);

    if (currentCount >= siteConfig.freeTierItemLimit) {
      const error = new Error("Free tier item limit reached.");
      Object.assign(error, { status: 403 });
      throw error;
    }
  }

  const sanitized = sanitizeItemInput(input);
  const item = await itemRepository.create(userId, {
    ...sanitized,
    type: resolveItemType(sanitized.type, sanitized.url),
    title: sanitized.title ?? "",
    sourceHost: getSourceHost(sanitized.url),
  });

  await auditLog({
    userId,
    action: "CREATE_ITEM",
    resource: "item",
    resourceId: item.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    metadata: { title: item.title, type: item.type },
  });

  return item;
}

export async function updateItem(
  userId: string,
  id: string,
  input: UpdateItemInput,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const sanitized = sanitizeItemInput(input);
  const shouldResolveType = hasOwn(sanitized, "type");
  const shouldUpdateSourceHost = hasOwn(sanitized, "url");
  const item = await itemRepository.update(id, userId, {
    ...sanitized,
    type: shouldResolveType ? resolveItemType(sanitized.type, sanitized.url) : undefined,
    sourceHost: shouldUpdateSourceHost ? getSourceHost(sanitized.url) : undefined,
  });

  await auditLog({
    userId,
    action: "UPDATE_ITEM",
    resource: "item",
    resourceId: item.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });

  return item;
}

export async function deleteItem(
  userId: string,
  id: string,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  await itemRepository.remove(id, userId);

  await auditLog({
    userId,
    action: "DELETE_ITEM",
    resource: "item",
    resourceId: id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });
}

export async function listTags(userId: string) {
  return itemRepository.listTags(userId);
}

export async function createTag(
  userId: string,
  plan: Plan,
  input: TagInput,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const tags = await itemRepository.listTags(userId);

  if (plan === "free" && tags.length >= siteConfig.freeTierTagLimit) {
    const error = new Error("Free tier tag limit reached.");
    Object.assign(error, { status: 403 });
    throw error;
  }

  const tag = await itemRepository.createTag(userId, {
    name: sanitizeTagName(input.name),
    color: input.color,
  });

  await auditLog({
    userId,
    action: "CREATE_TAG",
    resource: "tag",
    resourceId: tag.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });

  return tag;
}

export async function sanitizeExternalUrl(url: string) {
  return sanitizeUrl(url);
}
