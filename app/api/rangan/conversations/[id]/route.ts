import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { ranganConversationTitleSchema } from "@/lib/models/rangan.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getErrorResponse, getRateLimitIdentifier } from "@/lib/security/request";
import { requireJsonContentType, validateBody, validateId } from "@/lib/security/validate";
import * as conversations from "@/lib/services/rangan-conversation.service";

export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

// ─── GET /api/rangan/conversations/[id] — a saved chat with its turns ──────
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    return apiSuccess(await conversations.getConversation(user.id, validateId(params.id)));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

// ─── PATCH /api/rangan/conversations/[id] — rename ─────────────────────────
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const id = validateId(params.id);
    const body = await validateBody(request, ranganConversationTitleSchema);
    await conversations.renameConversation(user.id, id, body.title);
    return apiSuccess({ id, title: body.title });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

// ─── DELETE /api/rangan/conversations/[id] — delete, turns and all ─────────
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const id = validateId(params.id);
    await conversations.deleteConversation(user.id, id);
    return apiSuccess({ id });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
