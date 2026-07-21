import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import * as exportService from "@/lib/services/export.service";
import { processPdfSaveBack } from "@/lib/workers/export.worker";
import { ExportJobType } from "@prisma/client";
import { z } from "zod";

const createExportJobSchema = z.object({
  workspaceId: z.string().min(1),
  sourceAssetId: z.string().min(1),
  sourceRevisionId: z.string().min(1),
  jobType: z.nativeEnum(ExportJobType),
  inputJson: z.record(z.any()),
});

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    
    const body = await validateBody(request, createExportJobSchema);

    // Create the job
    const job = await exportService.createExportJob({
      workspaceId: body.workspaceId,
      sourceAssetId: body.sourceAssetId,
      sourceRevisionId: body.sourceRevisionId,
      jobType: body.jobType,
      inputJson: body.inputJson,
      createdBy: user.id,
    });

    // Start background processing
    if (job.jobType === "pdf_save_back") {
      // Run asynchronously, don't await to block the response
      void processPdfSaveBack(job.id).catch((err) => {
        console.error("Background export job failed:", err);
      });
    } else {
        // Mock processing for other job types
        void exportService.updateJobStatus(job.id, "failed", { errorMessage: "Unsupported job type." });
    }

    return apiSuccess({ jobId: job.id, status: job.status }, { status: 201 });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
