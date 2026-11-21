import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { ranganConversationTitleSchema } from "@/lib/models/rangan.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as conversations from "@/lib/services/rangan-conversation.service";

export const dynamic = "force-dynamic";

// ─── GET /api/rangan/conversations — the user's saved chats ────────────────
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    return apiSuccess(await conversations.listConversations(user.id));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

// ─── POST /api/rangan/conversations — start a saved chat ───────────────────
export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const body = await validateBody(request, ranganConversationTitleSchema);
    return apiSuccess(await conversations.createConversation(user.id, body.title), { status: 201 });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
