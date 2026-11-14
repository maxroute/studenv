import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import * as libraryService from "@/lib/services/library.service";

/** Storage used by uploaded files, the plan limit, and the largest files. */
export async function GET(_request: NextRequest) {
  try {
    const user = await requireAuth();
    return apiSuccess(await libraryService.storageUsage(user.id, user.plan));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
