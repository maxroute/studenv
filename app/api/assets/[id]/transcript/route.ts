import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import { ensureVideoTranscript } from "@/lib/services/video-transcript.server";

export const runtime = "nodejs";
/** YouTube can be slow to answer; each of its requests times out after 8 seconds. */
export const maxDuration = 30;

/** Saves the transcript of the user's YouTube video, if it has captions and none is saved yet. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    return apiSuccess(await ensureVideoTranscript(user.id, validateId(params.id)));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
