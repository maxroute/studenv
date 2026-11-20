import * as assetRepository from "@/lib/repositories/asset.repository";
import { 
  CreateAssetInput, 
  CreateRevisionInput 
} from "@/lib/models/asset.model";
import { MediaAssetStatus } from "@prisma/client";
import { auditLog } from "@/lib/repositories/base.repository";
import * as storageService from "@/lib/storage/s3";
import type { PdfPageTextBatch } from "@/lib/models/asset.model";
import { batchPageTexts, pagesToRead, pageTextFromItems, type PdfPageText } from "@/lib/utils/pdf-text";

let pdfJsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

async function getServerPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }

  return pdfJsPromise;
}

export async function createAsset(
  input: CreateAssetInput,
  context?: { ip?: string | null; userAgent?: string | null }
) {
  const asset = await assetRepository.createAsset(input);

  await auditLog({
    userId: input.ownerId,
    action: "CREATE_ASSET",
    resource: "mediaAsset",
    resourceId: asset.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    metadata: { title: asset.title, kind: asset.kind },
  });

  return asset;
}

export async function getAsset(id: string) {
  const asset = await assetRepository.findAssetById(id);
  if (!asset) {
    const error = new Error("Asset not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }
  return asset;
}

export async function getAssetByItem(itemId: string) {
  return assetRepository.findAssetByItemId(itemId);
}

export async function deleteAsset(
  id: string,
  userId: string,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const asset = await assetRepository.findAssetForDeletion(id, userId);

  if (!asset) {
    const error = new Error("Asset not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }

  const storageKeys = new Set<string>();

  for (const revision of asset.revisions) {
    if (revision.storageKey) {
      storageKeys.add(revision.storageKey);
    }
    if (revision.manifestKey) {
      storageKeys.add(revision.manifestKey);
    }
    for (const page of revision.pageManifests) {
      if (page.thumbnailKey) storageKeys.add(page.thumbnailKey);
      if (page.previewKey) storageKeys.add(page.previewKey);
      if (page.textLayerKey) storageKeys.add(page.textLayerKey);
    }
  }

  await assetRepository.deleteAssetById(id, userId);

  await Promise.allSettled(
    [...storageKeys].map((key) => storageService.deleteObject(key)),
  );

  await auditLog({
    userId,
    action: "DELETE_ASSET",
    resource: "mediaAsset",
    resourceId: id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    metadata: { title: asset.title, kind: asset.kind },
  });

  return { id: asset.id, title: asset.title };
}

export async function createRevision(
  input: CreateRevisionInput,
  context?: { ip?: string | null; userAgent?: string | null }
) {
  const revision = await assetRepository.createRevision(input);

  await auditLog({
    userId: input.createdBy,
    action: "CREATE_ASSET_REVISION",
    resource: "assetRevision",
    resourceId: revision.id,
    ipAddress: context?.ip,
    userAgent: context?.userAgent,
    metadata: { assetId: input.assetId, revisionNumber: revision.revisionNumber },
  });

  return revision;
}

export async function updateAssetStatus(id: string, status: MediaAssetStatus) {
  return assetRepository.updateAssetStatus(id, status);
}

export async function addPageManifests(
  revisionId: string,
  pages: Array<{
    pageNumber: number;
    width: number;
    height: number;
    rotation?: number;
    thumbnailKey?: string;
    previewKey?: string;
    textLayerKey?: string;
    searchText?: string;
  }>
) {
  return assetRepository.createPageManifests(revisionId, pages);
}

export async function getRevisionDetails(revisionId: string) {
  return assetRepository.getRevisionWithManifests(revisionId);
}

/** Saves a batch of a PDF's page text sent by the browser. Only the owner can, and only for the current revision. */
export async function savePdfPageText(userId: string, assetId: string, batch: PdfPageTextBatch) {
  const asset = await assetRepository.findAssetById(assetId);
  if (!asset || asset.ownerId !== userId || asset.kind !== "pdf") {
    throw Object.assign(new Error("Asset not found."), { status: 404 });
  }
  if (asset.currentRevisionId !== batch.revisionId) {
    // The PDF was replaced (an export) since the browser read it.
    throw Object.assign(new Error("This PDF has changed. Its text was not saved."), { status: 409 });
  }
  return assetRepository.savePageTexts(batch.revisionId, batch.pageCount, batch.pages);
}

/**
 * Reads a revision's page text on the server and saves it, for PDFs uploaded
 * before the browser did this. Up to {@link PDF_TEXT_MAX_PAGES} pages.
 */
export async function extractTextFromRevision(revisionId: string) {
  const revision = await assetRepository.getRevisionById(revisionId);
  if (!revision) throw new Error("Revision not found");

  const pdfjsLib = await getServerPdfJs();
  const buffer = await storageService.getFileBuffer(revision.storageKey);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;

  try {
    const pages: PdfPageText[] = [];
    for (let pageNumber = 1; pageNumber <= pagesToRead(pdf.numPages); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { width, height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push({ pageNumber, width, height, text: pageTextFromItems(content.items) });
      page.cleanup();
    }

    let created = 0;
    for (const batch of batchPageTexts(pages)) {
      created += (await assetRepository.savePageTexts(revisionId, pdf.numPages, batch)).created;
    }
    return { pageCount: pdf.numPages, pagesRead: pages.length, pagesWithText: pages.filter((page) => page.text).length, created };
  } finally {
    await pdf.destroy();
  }
}
