import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import { rescheduleTasksSchema } from "@/lib/models/planner.model";
import * as plannerService from "@/lib/services/planner.service";

export const dynamic = "force-dynamic";

// ─── PUT /api/planner/tasks/reschedule — New dates for several tasks ───
export async function PUT(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const body = await validateBody(request, rescheduleTasksSchema);
    return apiSuccess(await plannerService.rescheduleTasks(user.id, body.changes, body.today));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
