import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import { createTaskSchema } from "@/lib/models/planner.model";
import * as plannerService from "@/lib/services/planner.service";

export const dynamic = "force-dynamic";

// ─── GET /api/planner/tasks — List all tasks ────────────────
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const tasks = await plannerService.listTasks(user.id);
    return apiSuccess(tasks);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

// ─── POST /api/planner/tasks — Create a new task ────────────
export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const body = await validateBody(request, createTaskSchema);
    const task = await plannerService.createTask(user.id, body);
    return apiSuccess(task, { status: 201 });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
