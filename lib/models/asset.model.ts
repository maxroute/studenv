import { z } from "zod";
import { MediaAssetKind, MediaAssetOrigin, MediaAssetStatus } from "@prisma/client";

export const MediaAssetSchema = z.object({
  id: z.string().cuid(),
  ownerId: z.string(),
  itemId: z.string().nullable().optional(),
  kind: z.nativeEnum(MediaAssetKind),
  origin: z.nativeEnum(MediaAssetOrigin),
  title: z.string().max(500),
  mimeType: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  sourceHost: z.string().nullable().optional(),
  currentRevisionId: z.string().nullable().optional(),
  status: z.nativeEnum(MediaAssetStatus),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const AssetRevisionSchema = z.object({
  id: z.string().cuid(),
  assetId: z.string(),
  parentRevisionId: z.string().nullable().optional(),
  revisionNumber: z.number().int().positive(),
  storageKey: z.string(),
  manifestKey: z.string().nullable().optional(),
  checksum: z.string().nullable().optional(),
  sizeBytes: z.number().int().nullable().optional(),
  pageCount: z.number().int().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  createdBy: z.string(),
  createdAt: z.date(),
});

export type AssetRevision = z.infer<typeof AssetRevisionSchema>;

export const AssetPageManifestSchema = z.object({
  id: z.string().cuid(),
  assetRevisionId: z.string(),
  pageNumber: z.number().int().positive(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().int().default(0),
  thumbnailKey: z.string().nullable().optional(),
  previewKey: z.string().nullable().optional(),
  textLayerKey: z.string().nullable().optional(),
  searchText: z.string().nullable().optional(),
});

export type AssetPageManifest = z.infer<typeof AssetPageManifestSchema>;

export interface CreateAssetInput {
  ownerId: string;
  itemId?: string;
  kind: MediaAssetKind;
  origin: MediaAssetOrigin;
  title: string;
  mimeType?: string;
  sourceUrl?: string;
  sourceHost?: string;
}

export interface CreateRevisionInput {
  assetId: string;
  parentRevisionId?: string;
  storageKey: string;
  createdBy: string;
  sizeBytes?: number;
  pageCount?: number;
  durationMs?: number;
}
