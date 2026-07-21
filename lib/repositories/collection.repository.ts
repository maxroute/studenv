import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import type {
  CreateCollectionInput,
  UpdateCollectionInput,
} from "@/lib/models/collection.model";
import { assertOwnership } from "@/lib/repositories/base.repository";

const collectionInclude = {
  collectionItems: {
    select: {
      itemId: true,
    },
  },
} satisfies Prisma.CollectionInclude;

type CollectionWithRelations = Prisma.CollectionGetPayload<{
  include: typeof collectionInclude;
}>;

function toPublicCollection(collection: CollectionWithRelations) {
  const itemIds = collection.collectionItems.map((entry) => entry.itemId);

  return {
    id: collection.id,
    userId: collection.userId,
    title: collection.title,
    description: collection.description,
    itemIds,
    itemCount: itemIds.length,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

async function resolveOwnedItemIds(
  userId: string,
  itemIds: string[],
) {
  const prisma = getPrismaClient();
  const uniqueItemIds = [...new Set(itemIds)];

  if (!uniqueItemIds.length) {
    return [] as string[];
  }

  const ownedItems = await prisma.item.findMany({
    where: {
      userId,
      id: { in: uniqueItemIds },
    },
    select: {
      id: true,
    },
  });

  if (ownedItems.length !== uniqueItemIds.length) {
    const error = new Error("One or more selected items no longer exist.");
    Object.assign(error, { status: 400 });
    throw error;
  }

  return ownedItems.map((item) => item.id);
}

export async function findAll(userId: string) {
  const prisma = getPrismaClient();
  const collections = await prisma.collection.findMany({
    where: { userId },
    select: {
      id: true,
      userId: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { collectionItems: true },
      },
      collectionItems: {
        select: { itemId: true },
      },
    },
    orderBy: { title: "asc" },
    take: 100,
  });

  return collections.map((c) => ({
    id: c.id,
    userId: c.userId,
    title: c.title,
    description: c.description,
    itemIds: c.collectionItems.map((entry) => entry.itemId),
    itemCount: c._count.collectionItems,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

export async function findById(id: string, userId: string) {
  const prisma = getPrismaClient();
  const collection = await prisma.collection.findFirst({
    where: { id, userId },
    include: collectionInclude,
  });

  return collection ? toPublicCollection(collection) : null;
}

export async function create(userId: string, input: CreateCollectionInput) {
  const prisma = getPrismaClient();
  const ownedIds = await resolveOwnedItemIds(userId, input.itemIds ?? []);

  const created = await prisma.collection.create({
    data: {
      userId,
      title: input.title,
      description: input.description ?? null,
    },
  });

  if (ownedIds.length) {
    await prisma.collectionItem.createMany({
      data: ownedIds.map((itemId) => ({
        collectionId: created.id,
        itemId,
      })),
      skipDuplicates: true,
    });
  }

  const collection = await prisma.collection.findUniqueOrThrow({
    where: { id: created.id },
    include: collectionInclude,
  });

  return toPublicCollection(collection);
}

export async function update(
  id: string,
  userId: string,
  input: UpdateCollectionInput,
) {
  const prisma = getPrismaClient();
  await assertOwnership("collection", id, userId);

  const nextItemIds = input.itemIds;

  if (nextItemIds === undefined) {
    const collection = await prisma.collection.update({
      where: { id },
      data: {
        title: input.title,
        description:
          input.description === undefined ? undefined : (input.description ?? null),
      },
      include: collectionInclude,
    });

    return toPublicCollection(collection);
  }

  const ownedIds = await resolveOwnedItemIds(userId, nextItemIds);

  await prisma.collection.update({
    where: { id },
    data: {
      title: input.title,
      description:
        input.description === undefined ? undefined : (input.description ?? null),
      updatedAt: new Date(),
    },
  });

  await prisma.collectionItem.deleteMany({
    where: { collectionId: id },
  });

  if (ownedIds.length) {
    await prisma.collectionItem.createMany({
      data: ownedIds.map((itemId) => ({
        collectionId: id,
        itemId,
      })),
      skipDuplicates: true,
    });
  }

  const collection = await prisma.collection.findUniqueOrThrow({
    where: { id },
    include: collectionInclude,
  });

  return toPublicCollection(collection);
}

export async function remove(id: string, userId: string) {
  const prisma = getPrismaClient();
  await assertOwnership("collection", id, userId);
  await prisma.collection.delete({ where: { id } });
}
