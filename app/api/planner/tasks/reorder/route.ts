import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import { reorderTasksSchema } from "@/lib/models/planner.model";
import * as plannerService from "@/lib/services/planner.service";

export const dynamic = "force-dynamic";

// ─── PUT /api/planner/tasks/reorder — Reorder tasks bulk ────
export async function PUT(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const body = await validateBody(request, reorderTasksSchema);
    const result = await plannerService.reorderTasks(user.id, body.taskIds);
    return apiSuccess(result);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
