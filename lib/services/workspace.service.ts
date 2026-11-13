import * as workspaceRepository from "@/lib/repositories/workspace.repository";
import { CreateWorkspaceInput, SaveSnapshotInput } from "@/lib/models/workspace.model";
import { auditLog } from "@/lib/repositories/base.repository";
import { applySceneLinks, planSceneLinks } from "@/lib/services/link-index.service";

export async function createWorkspace(
  input: CreateWorkspaceInput,
  context?: { ip?: string | null; userAgent?: string | null }
) {
  const workspace = await workspaceRepository.createWorkspace(input);

  await auditLog({
    userId: input.ownerId,
    action: "CREATE_WORKSPACE",
    resource: "workspace",
    resourceId: workspace.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    metadata: { title: workspace.title },
  });

  return workspace;
}

export async function getWorkspace(userId: string, id: string) {
  const workspace = await workspaceRepository.findWorkspaceById(id, userId);
  if (!workspace) {
    const error = new Error("Workspace not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }
  return workspace;
}

export async function listWorkspaces(userId: string) {
  return workspaceRepository.findAllWorkspaces(userId);
}

export async function renameWorkspace(
  userId: string,
  id: string,
  title: string,
  context?: { ip?: string | null; userAgent?: string | null }
) {
  const workspace = await workspaceRepository.renameWorkspace(id, userId, title);

  await auditLog({
    userId,
    action: "RENAME_WORKSPACE",
    resource: "workspace",
    resourceId: workspace.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    metadata: { title },
  });

  return workspace;
}

export async function setWorkspaceCoverAsset(
  userId: string,
  id: string,
  coverAssetId: string | null,
  context?: { ip?: string | null; userAgent?: string | null }
) {
  const workspace = await workspaceRepository.updateWorkspaceCoverAsset(
    id,
    userId,
    coverAssetId,
  );

  await auditLog({
    userId,
    action: "SET_WORKSPACE_COVER_ASSET",
    resource: "workspace",
    resourceId: workspace.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    metadata: { coverAssetId },
  });

  return workspace;
}

export async function saveSnapshot(
  input: SaveSnapshotInput,
  context?: { ip?: string | null; userAgent?: string | null }
) {
  // Links are extracted before the transaction and written inside it (§3.3).
  const linkPlan = planSceneLinks(input.workspaceId, input.sceneJson);
  const snapshot = await workspaceRepository.saveSnapshot(input, (tx) =>
    applySceneLinks(input.createdBy, input.workspaceId, linkPlan, tx),
  );

  await auditLog({
    userId: input.createdBy,
    action: "SAVE_WORKSPACE_SNAPSHOT",
    resource: "workspaceSnapshot",
    resourceId: snapshot.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    metadata: { workspaceId: input.workspaceId, version: snapshot.version },
  });

  return snapshot;
}

export async function recordOperation(input: {
  workspaceId: string;
  version: number;
  actorId: string;
  clientId: string;
  opType: string;
  payloadJson: string;
}) {
  return workspaceRepository.recordOperation(input);
}

export async function getSyncUpdates(workspaceId: string, lastVersion: number) {
  return workspaceRepository.getOperationsAfter(workspaceId, lastVersion);
}
