import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";

export async function assertOwnership(
  resource: "item" | "tag" | "collection",
  id: string,
  userId: string,
) {
  const prisma = getPrismaClient();
  const exists =
    resource === "item"
      ? await prisma.item.findFirst({
          where: { id, userId },
          select: { id: true },
        })
      : resource === "tag"
        ? await prisma.tag.findFirst({
            where: { id, userId },
            select: { id: true },
          })
        : await prisma.collection.findFirst({
            where: { id, userId },
            select: { id: true },
          });

  if (!exists) {
    const error = new Error("Resource not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  return exists;
}

export async function auditLog(input: {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
}) {
  const prisma = getPrismaClient();
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}

export async function fullTextSearch(userId: string, query: string) {
  const prisma = getPrismaClient();
  if (!query.trim()) {
    return [] as string[];
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM "Item"
    WHERE "userId" = ${userId}
      AND search_vector @@ websearch_to_tsquery('pg_catalog.english', ${query})
    ORDER BY ts_rank(search_vector, websearch_to_tsquery('pg_catalog.english', ${query})) DESC,
      "createdAt" DESC
    LIMIT 200
  `);

  return rows.map((row) => row.id);
}
