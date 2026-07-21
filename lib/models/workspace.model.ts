import { z } from "zod";

export const WorkspaceSchema = z.object({
  id: z.string().cuid(),
  ownerId: z.string(),
  title: z.string().max(500),
  description: z.string().nullable().optional(),
  coverAssetId: z.string().nullable().optional(),
  baseCollectionId: z.string().nullable().optional(),
  lastSnapshotId: z.string().nullable().optional(),
  latestVersion: z.number().int().default(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

export const WorkspaceSnapshotSchema = z.object({
  id: z.string().cuid(),
  workspaceId: z.string(),
  version: z.number().int().positive(),
  sceneJson: z.string(),
  cameraJson: z.string().nullable().optional(),
  createdBy: z.string(),
  createdAt: z.date(),
});

export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;

export const WorkspaceOperationSchema = z.object({
  id: z.string().cuid(),
  workspaceId: z.string(),
  version: z.number().int().positive(),
  actorId: z.string(),
  clientId: z.string(),
  opType: z.string(),
  payloadJson: z.string(),
  createdAt: z.date(),
});

export type WorkspaceOperation = z.infer<typeof WorkspaceOperationSchema>;

export interface CreateWorkspaceInput {
  ownerId: string;
  title: string;
  description?: string;
  coverAssetId?: string;
  baseCollectionId?: string;
}

export interface SaveSnapshotInput {
  workspaceId: string;
  sceneJson: string;
  cameraJson?: string;
  createdBy: string;
}
