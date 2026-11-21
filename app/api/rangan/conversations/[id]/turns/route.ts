import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { ranganTurnsSchema } from "@/lib/models/rangan.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody, validateId } from "@/lib/security/validate";
import * as conversations from "@/lib/services/rangan-conversation.service";

export const dynamic = "force-dynamic";

// ─── POST /api/rangan/conversations/[id]/turns — save new or changed turns ──
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const id = validateId(params.id);
    const body = await validateBody(request, ranganTurnsSchema);
    await conversations.saveTurns(user.id, id, body);
    return apiSuccess({ id });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
