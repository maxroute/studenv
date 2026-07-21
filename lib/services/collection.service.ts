import type {
  CreateCollectionInput,
  UpdateCollectionInput,
} from "@/lib/models/collection.model";
import * as collectionRepository from "@/lib/repositories/collection.repository";
import { auditLog } from "@/lib/repositories/base.repository";
import { sanitizeCollectionInput } from "@/lib/security/sanitize";

function ensureCollectionTitle(
  title: string | null | undefined,
  fallbackMessage: string,
) {
  if (!title) {
    const error = new Error(fallbackMessage);
    Object.assign(error, { status: 400 });
    throw error;
  }

  return title;
}

export async function listCollections(userId: string) {
  return collectionRepository.findAll(userId);
}

export async function getCollection(userId: string, id: string) {
  const collection = await collectionRepository.findById(id, userId);

  if (!collection) {
    const error = new Error("Collection not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  return collection;
}

export async function createCollection(
  userId: string,
  input: CreateCollectionInput,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const sanitized = sanitizeCollectionInput(input);
  const collection = await collectionRepository.create(userId, {
    ...sanitized,
    title: ensureCollectionTitle(sanitized.title, "Collection title is required."),
  });

  await auditLog({
    userId,
    action: "CREATE_COLLECTION",
    resource: "collection",
    resourceId: collection.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    metadata: { title: collection.title, itemCount: collection.itemCount },
  });

  return collection;
}

export async function updateCollection(
  userId: string,
  id: string,
  input: UpdateCollectionInput,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const sanitized = sanitizeCollectionInput(input);

  if ("title" in sanitized) {
    ensureCollectionTitle(
      sanitized.title,
      "Collection title cannot be empty.",
    );
  }

  const collection = await collectionRepository.update(id, userId, sanitized);

  await auditLog({
    userId,
    action: "UPDATE_COLLECTION",
    resource: "collection",
    resourceId: collection.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });

  return collection;
}

export async function deleteCollection(
  userId: string,
  id: string,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  await collectionRepository.remove(id, userId);

  await auditLog({
    userId,
    action: "DELETE_COLLECTION",
    resource: "collection",
    resourceId: id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
  });
}
