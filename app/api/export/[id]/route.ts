import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import * as exportService from "@/lib/services/export.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const job = await exportService.getExportJob(params.id);

    if (!job) {
      throw { status: 404, message: "Export job not found" };
    }

    if (job.createdBy !== user.id) {
       throw { status: 403, message: "Forbidden" };
    }

    return apiSuccess({
      id: job.id,
      status: job.status,
      jobType: job.jobType,
      targetRevisionId: job.targetRevisionId,
      errorMessage: job.status === "failed" ? "Export failed. Please try again." : null,
    });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
