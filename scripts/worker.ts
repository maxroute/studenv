/*
 * Spatial Workspace Background Worker
 * 
 * To run: npx tsx scripts/worker.ts
 */

import { prisma } from "@/lib/db/prisma";
import * as ingestService from "@/lib/services/ingest.service";
import { processPdfSaveBack } from "@/lib/workers/export.worker";

async function pollJobs() {
  console.log("Worker polling for jobs...");
  
  try {
    // 1. Process BackgroundJobs (ingest, thumbnails, etc.)
    const nextBackgroundJob = await prisma.backgroundJob.findFirst({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
    });

    if (nextBackgroundJob) {
      console.log(`Processing background job: ${nextBackgroundJob.id} (${nextBackgroundJob.type})`);
      await ingestService.processIngestion(nextBackgroundJob.id);
    }

    // 2. Process ExportJobs (save-back)
    const nextExportJob = await prisma.exportJob.findFirst({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
    });

    if (nextExportJob) {
      console.log(`Processing export job: ${nextExportJob.id} (${nextExportJob.jobType})`);
      if (nextExportJob.jobType === "pdf_save_back") {
        await processPdfSaveBack(nextExportJob.id);
      } else {
        console.warn(`Unsupported export job type: ${nextExportJob.jobType}`);
      }
    }

  } catch (error: any) {
    console.error("Worker polling error:", error.message);
  }

  // Poll again in 5 seconds
  setTimeout(pollJobs, 5000);
}

// Start polling
pollJobs();

process.on("SIGINT", () => {
  console.log("Worker shutting down...");
  process.exit(0);
});
