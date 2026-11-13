import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { NoteConflictError } from "@/lib/services/note.service";

type User = Awaited<ReturnType<typeof requireAuth>>;

/**
 * Auth and error shaping shared by the notes routes. Rate limiting is applied
 * once per request by middleware.ts (apiRateLimiter on every /api path);
 * repeating it here would count each request twice and autosave would hit the
 * limit after under a minute of typing.
 */
export async function handleNoteRequest(
  _request: NextRequest,
  run: (user: User) => Promise<unknown>,
  init?: { status?: number },
) {
  try {
    const user = await requireAuth();
    return apiSuccess(await run(user), init);
  } catch (error) {
    if (error instanceof NoteConflictError) {
      // The client needs the current version to offer "Load latest" or "Keep mine".
      return apiError(error.message, 409, { currentVersion: error.currentVersion, updatedAt: error.updatedAt.toISOString() });
    }
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
