import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as storageService from "@/lib/storage/s3";
import * as assetService from "@/lib/services/asset.service";
import * as exportService from "@/lib/services/export.service";
import { ExportJobStatus } from "@prisma/client";

export async function processPdfSaveBack(jobId: string) {
  const job = await exportService.getExportJob(jobId);
  if (!job) throw new Error("Job not found");

  try {
    await exportService.updateJobStatus(jobId, "processing" as ExportJobStatus);

    // 1. Get source PDF from storage
    const sourceBuffer = await storageService.getFileBuffer(job.sourceRevision.storageKey);
    const pdfDoc = await PDFDocument.load(sourceBuffer);
    const pages = pdfDoc.getPages();

    // 2. Parse annotations (simplified for now)
    const input = JSON.parse(job.inputJson);
    const annotations = input.annotations as any[];

    // 3. Stamp annotations
    for (const ann of annotations) {
      const pageIndex = ann.pageNumber - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;
      
      const page = pages[pageIndex];
      const { width, height } = page.getSize();

      // Simple implementation: drawing text or boxes
      if (ann.type === "text") {
        page.drawText(ann.text, {
          x: ann.x * width / 100, // Assuming 0-100 scale from frontend
          y: height - (ann.y * height / 100),
          size: ann.fontSize || 12,
          color: rgb(0, 0, 0),
        });
      } else if (ann.type === "rect") {
        page.drawRectangle({
          x: ann.x * width / 100,
          y: height - (ann.y * height / 100) - (ann.height * height / 100),
          width: ann.width * width / 100,
          height: ann.height * height / 100,
          borderColor: rgb(1, 0, 0),
          borderWidth: 2,
        });
      }
    }

    // 4. Save and Upload
    const pdfBytes = await pdfDoc.save();
    const storageKey = `revisions/${job.sourceAssetId}-${Date.now()}.pdf`;
    await storageService.uploadBuffer(
      storageKey,
      Buffer.from(pdfBytes),
      "application/pdf",
    );

    // 5. Create new AssetRevision
    const newRevision = await assetService.createRevision({
      assetId: job.sourceAssetId,
      parentRevisionId: job.sourceRevisionId,
      storageKey,
      createdBy: job.createdBy,
    });

    // 6. Finalize Job
    await exportService.updateJobStatus(jobId, "done" as ExportJobStatus, {
       targetRevisionId: newRevision.id,
    });

  } catch (error: any) {
    console.error("Export error", error);
    await exportService.updateJobStatus(jobId, "failed" as ExportJobStatus, {
      errorMessage: "Export failed. Please try again." ,
    });
  }
}
