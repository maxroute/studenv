import { z } from "zod";
import { MediaAssetKind, MediaAssetOrigin, MediaAssetStatus } from "@prisma/client";
import { PDF_PAGE_TEXT_MAX_CHARS, PDF_TEXT_BATCH_MAX_PAGES, PDF_TEXT_MAX_PAGES } from "@/lib/utils/pdf-text";

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

/** A batch of a PDF revision's page text, sent by the browser after an upload. */
export const PdfPageTextBatchSchema = z
  .object({
    revisionId: z.string().min(1).max(64),
    /** Pages in the whole PDF, read or not. */
    pageCount: z.number().int().positive().max(100_000),
    pages: z
      .array(
        z.object({
          pageNumber: z.number().int().positive().max(PDF_TEXT_MAX_PAGES),
          width: z.number().positive().finite().max(100_000),
          height: z.number().positive().finite().max(100_000),
          text: z.string().max(PDF_PAGE_TEXT_MAX_CHARS),
        }),
      )
      .min(1)
      .max(PDF_TEXT_BATCH_MAX_PAGES),
  })
  .refine((batch) => batch.pages.every((page) => page.pageNumber <= batch.pageCount), {
    message: "A page number is past the end of the PDF.",
    path: ["pages"],
  })
  .refine((batch) => new Set(batch.pages.map((page) => page.pageNumber)).size === batch.pages.length, {
    message: "A page is listed twice.",
    path: ["pages"],
  });

export type PdfPageTextBatch = z.infer<typeof PdfPageTextBatchSchema>;
