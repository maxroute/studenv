import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import * as libraryService from "@/lib/services/library.service";

/** Your files (PDFs, videos, links, images) and the pages and boards each is used in. */
export async function GET(_request: NextRequest) {
  try {
    const user = await requireAuth();
    return apiSuccess(await libraryService.listFiles(user.id));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
