import { NextRequest } from "next/server";
import {
  createItemSchema,
  itemQuerySchema,
} from "@/lib/models/item.model";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import {
  apiRateLimiter,
  checkRateLimit,
  searchRateLimiter,
} from "@/lib/security/rateLimit";
import {
  getErrorResponse,
  getQueryObject,
  getRateLimitIdentifier,
  getRequestContext,
} from "@/lib/security/request";
import {
  requireJsonContentType,
  validateBody,
  validateQuery,
} from "@/lib/security/validate";
import * as itemService from "@/lib/services/item.service";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const query = validateQuery(getQueryObject(request), itemQuerySchema);
    await checkRateLimit(
      query.q ? searchRateLimiter : apiRateLimiter,
      getRateLimitIdentifier(request, user.id),
    );
    const items = await itemService.listItems(user.id, query);
    // Not reused by the browser: pages are moved and deleted, and the Library must show
    // that at once. The app keeps its own copy in memory and refreshes it after changes.
    return apiSuccess(items);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const body = await validateBody(request, createItemSchema);
    const item = await itemService.createItem(
      user.id,
      user.plan,
      body,
      getRequestContext(request),
    );
    return apiSuccess(item, { status: 201 });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
