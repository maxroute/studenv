import { NextRequest } from "next/server";
import { createCollectionSchema } from "@/lib/models/collection.model";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import {
  getErrorResponse,
  getRateLimitIdentifier,
  getRequestContext,
} from "@/lib/security/request";
import {
  requireJsonContentType,
  validateBody,
} from "@/lib/security/validate";
import * as collectionService from "@/lib/services/collection.service";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const collections = await collectionService.listCollections(user.id);
    return apiSuccess(collections, { cacheSeconds: 60 });
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
    const body = await validateBody(request, createCollectionSchema);
    const collection = await collectionService.createCollection(
      user.id,
      body,
      getRequestContext(request),
    );
    return apiSuccess(collection, { status: 201 });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
