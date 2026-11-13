import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";

type User = Awaited<ReturnType<typeof requireAuth>>;

/** Auth and error shaping for the flashcard routes (rate limiting is in middleware.ts). */
export async function handleFlashcardRequest(_request: NextRequest, run: (user: User) => Promise<unknown>, init?: { status?: number }) {
  try {
    const user = await requireAuth();
    return apiSuccess(await run(user), init);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
