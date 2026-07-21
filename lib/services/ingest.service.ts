import * as assetService from "./asset.service";
import * as jobService from "./job.service";
import { JobType, MediaAssetStatus } from "@prisma/client";

export async function startIngestion(assetId: string) {
  const asset = await assetService.getAsset(assetId);
  
  // Update status to processing
  await assetService.updateAssetStatus(assetId, "processing");

  // Queue background jobs
  await jobService.queueJob("pdf_ingest", { assetId });
  await jobService.queueJob("thumbnail_gen", { assetId });
  await jobService.queueJob("text_extraction", { assetId });

  return { assetId, status: "queued" };
}

/**
 * Simulated worker function for PDF ingestion
 */
export async function processIngestion(jobId: string) {
  const job = await jobService.getJobStatus(jobId);
  if (!job) return;

  const { assetId } = JSON.parse((job as any).payloadJson);
  const asset = await assetService.getAsset(assetId);

  try {
    // 1. Mark job as processing
    await jobService.startJob(jobId);

    // 2. Simulate PDF parsing (page count, dimensions)
    // In a real app, use pdfjs-dist on the server or a dedicated worker
    const pageCount = 5; // Placeholder
    const revision = await assetService.createRevision({
      assetId,
      storageKey: `assets/${assetId}/original.pdf`,
      createdBy: asset.ownerId,
      pageCount,
    });

    // 3. Create page manifests
    const pages = Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1,
      width: 612, // Standard US Letter
      height: 792,
      thumbnailKey: `assets/${assetId}/revisions/${revision.id}/pages/${i + 1}/thumb.png`,
    }));

    await assetService.addPageManifests(revision.id, pages);

    // 4. Complete job
    await jobService.completeJob(jobId, { revisionId: revision.id });
    
    // 5. Mark asset as ready if all jobs done
    await assetService.updateAssetStatus(assetId, "ready");

  } catch (error: any) {
    await jobService.failJob(jobId, error.message);
    await assetService.updateAssetStatus(assetId, "failed");
  }
}
