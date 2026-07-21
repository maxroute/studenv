import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody, validateId } from "@/lib/security/validate";
import { updateTaskSchema } from "@/lib/models/planner.model";
import * as plannerService from "@/lib/services/planner.service";

export const dynamic = "force-dynamic";

// ─── PATCH /api/planner/tasks/[id] — Update a task ──────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const taskId = validateId(params.id);
    const body = await validateBody(request, updateTaskSchema);
    const task = await plannerService.updateTask(user.id, taskId, body);
    return apiSuccess(task);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

// ─── DELETE /api/planner/tasks/[id] — Delete a task ─────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const taskId = validateId(params.id);
    await plannerService.deleteTask(user.id, taskId);
    return apiSuccess({ deleted: true });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
