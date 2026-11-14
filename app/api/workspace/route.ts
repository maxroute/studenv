import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import * as workspaceService from "@/lib/services/workspace.service";

/** The caller's workspaces (id and title), newest first; used by "Add to workspace". */
export async function GET(_request: NextRequest) {
  try {
    const user = await requireAuth();
    return apiSuccess(await workspaceService.listWorkspaceTitles(user.id));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
