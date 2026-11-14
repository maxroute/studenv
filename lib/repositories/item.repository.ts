import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type {
  CreateItemInput,
  ItemQueryInput,
  TagInput,
  UpdateItemInput,
} from "@/lib/models/item.model";
import { assertOwnership, fullTextSearch } from "@/lib/repositories/base.repository";
import { inferItemTypeFromUrl } from "@/lib/utils/item-type";

/** Default max items returned by list queries (prevents unbounded fetches). */
const DEFAULT_LIST_LIMIT = 200;

/** Maximum excerpt length returned in list views (chars). */
const EXCERPT_SUMMARY_LENGTH = 300;

// ---------------------------------------------------------------------------
// Full include — used by findById, create, update (detail views)
// ---------------------------------------------------------------------------
const itemInclude = {
  itemTags: {
    include: {
      tag: true,
    },
  },
  // Notes items open their Note (Stage 5); trashed notes hide their item.
  note: { select: { id: true } },
} satisfies Prisma.ItemInclude;

type ItemWithRelations = Prisma.ItemGetPayload<{
  include: typeof itemInclude;
}>;

// ---------------------------------------------------------------------------
// Lightweight select — used by findAll (list views).
// Excludes `notes` entirely and fetches only needed scalar fields + tags.
// ---------------------------------------------------------------------------
const itemListSelect = {
  id: true,
  userId: true,
  type: true,
  title: true,
  url: true,
  excerpt: true,
  status: true,
  starred: true,
  sourceHost: true,
  createdAt: true,
  updatedAt: true,
  note: { select: { id: true } },
  itemTags: {
    select: {
      tag: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
    },
  },
} satisfies Prisma.ItemSelect;

type ItemListRow = Prisma.ItemGetPayload<{ select: typeof itemListSelect }>;

function mapSort(sort?: ItemQueryInput["sort"]) {
  switch (sort) {
    case "oldest":
      return { createdAt: "asc" } as const;
    case "title":
      return { title: "asc" } as const;
    case "updated":
      return { updatedAt: "desc" } as const;
    case "newest":
    default:
      return { createdAt: "desc" } as const;
  }
}

function buildTagOperations(
  userId: string,
  tags?: string[],
  colors?: Record<string, string>,
) {
  const uniqueTags = tags ? [...new Set(tags)] : undefined;

  if (!uniqueTags?.length) {
    return undefined;
  }

  return {
    create: uniqueTags.map((name) => ({
      tag: {
        connectOrCreate: {
          where: {
            userId_name: {
              userId,
              name,
            },
          },
          create: {
            userId,
            name,
            color: colors?.[name] ?? "#f5a623",
          },
        },
      },
    })),
  };
}

async function syncItemTags(
  tx: Prisma.TransactionClient,
  itemId: string,
  userId: string,
  tags: string[],
  colors?: Record<string, string>,
) {
  const uniqueTags = [...new Set(tags)];

  if (!uniqueTags.length) {
    await tx.itemTag.deleteMany({ where: { itemId } });
    return;
  }

  const tagRecords = await Promise.all(
    uniqueTags.map((name) =>
      tx.tag.upsert({
        where: {
          userId_name: {
            userId,
            name,
          },
        },
        update: {},
        create: {
          userId,
          name,
          color: colors?.[name] ?? "#f5a623",
        },
        select: {
          id: true,
        },
      }),
    ),
  );

  const tagIds = tagRecords.map((tag) => tag.id);

  await tx.itemTag.deleteMany({
    where: {
      itemId,
      tagId: { notIn: tagIds },
    },
  });

  await tx.itemTag.createMany({
    data: tagIds.map((tagId) => ({
      itemId,
      tagId,
    })),
    skipDuplicates: true,
  });
}

/** Full public item — includes notes. Used by detail view & mutations. */
export function toPublicItem(item: ItemWithRelations) {
  const resolvedType =
    item.type === "article" ? (inferItemTypeFromUrl(item.url) ?? item.type) : item.type;

  return {
    id: item.id,
    userId: item.userId,
    type: resolvedType,
    title: item.title,
    url: item.url,
    excerpt: item.excerpt,
    notes: item.notes,
    noteId: item.note?.id ?? null,
    status: item.status,
    starred: item.starred,
    sourceHost: item.sourceHost,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    tags: item.itemTags.map((entry) => ({
      id: entry.tag.id,
      name: entry.tag.name,
      color: entry.tag.color,
    })),
  };
}

/** Lean public item — excludes notes, truncates excerpt. Used by list view. */
function toPublicItemSummary(item: ItemListRow) {
  const resolvedType =
    item.type === "article" ? (inferItemTypeFromUrl(item.url) ?? item.type) : item.type;

  const excerpt = item.excerpt
    ? item.excerpt.length > EXCERPT_SUMMARY_LENGTH
      ? item.excerpt.slice(0, EXCERPT_SUMMARY_LENGTH) + "…"
      : item.excerpt
    : null;

  return {
    id: item.id,
    userId: item.userId,
    type: resolvedType,
    title: item.title,
    url: item.url,
    excerpt,
    notes: null as string | null,  // never shipped in list view
    noteId: item.note?.id ?? null,
    status: item.status,
    starred: item.starred,
    sourceHost: item.sourceHost,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    tags: item.itemTags.map((entry) => ({
      id: entry.tag.id,
      name: entry.tag.name,
      color: entry.tag.color,
    })),
  };
}

export async function countByUserId(userId: string) {
  return prisma.item.count({ where: { userId } });
}

export async function findById(id: string, userId: string) {
  const item = await prisma.item.findFirst({
    where: { id, userId },
    include: itemInclude,
  });

  return item ? toPublicItem(item) : null;
}

export async function findAll(userId: string, query: ItemQueryInput = {}) {
  const searchIds = query.q ? await fullTextSearch(userId, query.q) : null;

  if (query.q && !searchIds?.length) {
    return [];
  }

  const items = await prisma.item.findMany({
    where: {
      userId,
      id: searchIds ? { in: searchIds } : undefined,
      type: query.type,
      status: query.status,
      starred: query.starred,
      itemTags: query.tag
        ? {
            some: {
              tag: {
                name: query.tag,
              },
            },
          }
        : undefined,
      // A note in the trash keeps its Shelf entry for restoring, but hidden.
      NOT: { note: { is: { deletedAt: { not: null } } } },
    },
    select: itemListSelect,
    orderBy: mapSort(query.sort),
    take: DEFAULT_LIST_LIMIT,
  });

  const mapped = items.map(toPublicItemSummary);

  if (searchIds) {
    const order = new Map(searchIds.map((id, index) => [id, index]));
    mapped.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  return mapped;
}

export async function create(
  userId: string,
  input: CreateItemInput & { sourceHost?: string | null },
) {
  const item = await prisma.item.create({
    data: {
      userId,
      type: input.type,
      title: input.title,
      url: input.url,
      excerpt: input.excerpt,
      notes: input.notes,
      status: input.status ?? "unread",
      starred: input.starred ?? false,
      sourceHost: input.sourceHost ?? null,
      itemTags: buildTagOperations(userId, input.tags),
    },
    include: itemInclude,
  });

  return toPublicItem(item);
}

export async function update(
  id: string,
  userId: string,
  input: UpdateItemInput & { sourceHost?: string | null },
) {
  await assertOwnership("item", id, userId);

  const updateData = {
    type: input.type,
    title: input.title,
    url: input.url,
    excerpt: input.excerpt,
    notes: input.notes,
    status: input.status,
    starred: input.starred,
    sourceHost:
      input.sourceHost === undefined ? undefined : (input.sourceHost ?? null),
  };

  if (input.tags === undefined) {
    const item = await prisma.item.update({
      where: { id },
      data: updateData,
      include: itemInclude,
    });

    return toPublicItem(item);
  }

  const nextTags = input.tags;

  return prisma.$transaction(async (tx) => {
    await tx.item.update({
      where: { id },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    await syncItemTags(tx, id, userId, nextTags);

    const item = await tx.item.findUniqueOrThrow({
      where: { id },
      include: itemInclude,
    });

    return toPublicItem(item);
  });
}

export async function remove(id: string, userId: string) {
  await assertOwnership("item", id, userId);
  await prisma.item.delete({ where: { id } });
}

export async function listTags(userId: string) {
  return prisma.tag.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });
}

export async function createTag(userId: string, input: TagInput) {
  return prisma.tag.upsert({
    where: {
      userId_name: {
        userId,
        name: input.name,
      },
    },
    update: {
      color: input.color ?? "#f5a623",
    },
    create: {
      userId,
      name: input.name,
      color: input.color ?? "#f5a623",
    },
  });
}
