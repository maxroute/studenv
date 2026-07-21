import * as assetRepository from "@/lib/repositories/asset.repository";
import { 
  CreateAssetInput, 
  CreateRevisionInput 
} from "@/lib/models/asset.model";
import { MediaAssetStatus } from "@prisma/client";
import { auditLog } from "@/lib/repositories/base.repository";
import * as storageService from "@/lib/storage/s3";

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

export async function extractTextFromRevision(revisionId: string) {
  const revision = await assetRepository.getRevisionById(revisionId);
  if (!revision) throw new Error("Revision not found");

  const pdfjsLib = await getServerPdfJs();
  const buffer = await storageService.getFileBuffer(revision.storageKey);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  } as any);
  const pdf = await loadingTask.promise;

  const pageManifests = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    const text = strings.join(" ");
    const { width, height } = page.getViewport({ scale: 1.0 });

    pageManifests.push({
      pageNumber: i,
      width,
      height,
      searchText: text,
    });
  }

  return assetRepository.createPageManifests(revisionId, pageManifests);
}
