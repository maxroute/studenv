import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { CreateWorkspaceInput, SaveSnapshotInput } from "@/lib/models/workspace.model";

const workspaceInclude = {
  snapshots: {
    orderBy: {
      version: "desc" as const,
    },
    take: 1,
  },
} satisfies Prisma.WorkspaceInclude;

export async function createWorkspace(input: CreateWorkspaceInput) {
  return prisma.workspace.create({
    data: {
      ownerId: input.ownerId,
      title: input.title,
      description: input.description,
      coverAssetId: input.coverAssetId,
      baseCollectionId: input.baseCollectionId,
    },
    include: workspaceInclude,
  });
}

export async function findWorkspaceById(id: string, userId: string) {
  return prisma.workspace.findFirst({
    where: { id, ownerId: userId },
    include: workspaceInclude,
  });
}

/** Ids and titles only (no snapshots), for pickers. */
export function listWorkspaceTitles(userId: string) {
  return prisma.workspace.findMany({
    where: { ownerId: userId },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function findAllWorkspaces(userId: string) {
  return prisma.workspace.findMany({
    where: { ownerId: userId },
    include: workspaceInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function renameWorkspace(id: string, userId: string, title: string) {
  return prisma.workspace.update({
    where: { id, ownerId: userId },
    data: { title },
  });
}

export async function updateWorkspaceCoverAsset(
  id: string,
  userId: string,
  coverAssetId: string | null,
) {
  return prisma.workspace.update({
    where: { id, ownerId: userId },
    data: { coverAssetId },
    include: workspaceInclude,
  });
}

/**
 * Allocate the next snapshot version by locking/updating the owning Workspace
 * row. latestVersion stores the next version to allocate (default 1).
 *
 * GREATEST(..., MAX(snapshot.version) + 1) also repairs workspaces whose
 * counter predates this allocator. Updating the same workspace row serializes
 * concurrent writers, avoiding duplicate versions without scanning/locking
 * snapshot rows independently.
 */
/** Runs inside the snapshot transaction after the snapshot row is written (link index, Stage 6). */
export type SnapshotSavedHook = (tx: Prisma.TransactionClient) => Promise<void>;

export async function saveSnapshot(input: SaveSnapshotInput, afterSave?: SnapshotSavedHook) {
  return prisma.$transaction(async (tx) => {
    const allocation = await tx.$queryRaw<Array<{ version: number }>>(Prisma.sql`
      UPDATE "Workspace"
      SET "latestVersion" = GREATEST(
        "latestVersion",
        COALESCE(
          (
            SELECT MAX("version")
            FROM "WorkspaceSnapshot"
            WHERE "workspaceId" = "Workspace"."id"
          ),
          0
        ) + 1
      ) + 1,
      "updatedAt" = NOW()
      WHERE "id" = ${input.workspaceId}
        AND "ownerId" = ${input.createdBy}
      RETURNING "latestVersion" - 1 AS "version"
    `);

    if (allocation.length === 0) {
      const error = new Error("Workspace not found.");
      Object.assign(error, { status: 404 });
      throw error;
    }

    const snapshot = await tx.workspaceSnapshot.create({
      data: {
        workspaceId: input.workspaceId,
        version: allocation[0].version,
        sceneJson: input.sceneJson,
        cameraJson: input.cameraJson,
        createdBy: input.createdBy,
      },
    });

    if (afterSave) await afterSave(tx);

    return snapshot;
  }, {
    // Keep enough headroom for transient database/connection latency while
    // keeping the transaction bounded. The transaction itself now contains
    // only the atomic counter update and snapshot insert.
    maxWait: 5_000,
    timeout: 15_000,
  });
}

export async function recordOperation(input: {
  workspaceId: string;
  version: number;
  actorId: string;
  clientId: string;
  opType: string;
  payloadJson: string;
}) {
  return prisma.workspaceOperation.create({
    data: input,
  });
}

export async function getOperationsAfter(workspaceId: string, version: number) {
  return prisma.workspaceOperation.findMany({
    where: {
      workspaceId,
      version: { gt: version },
    },
    orderBy: { version: "asc" },
  });
}
