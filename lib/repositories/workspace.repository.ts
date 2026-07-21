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

export async function saveSnapshot(input: SaveSnapshotInput) {
  return prisma.$transaction(async (tx) => {
    await tx.workspace.findUniqueOrThrow({
      where: { id: input.workspaceId },
      select: { id: true },
    });

    const latestSnapshot = await tx.workspaceSnapshot.findFirst({
      where: { workspaceId: input.workspaceId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const version = (latestSnapshot?.version ?? 0) + 1;

    const snapshot = await tx.workspaceSnapshot.create({
      data: {
        workspaceId: input.workspaceId,
        version,
        sceneJson: input.sceneJson,
        cameraJson: input.cameraJson,
        createdBy: input.createdBy,
      },
    });

    return snapshot;
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
