import { NextRequest } from "next/server";
import { updateCollectionSchema } from "@/lib/models/collection.model";
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
  validateId,
} from "@/lib/security/validate";
import * as collectionService from "@/lib/services/collection.service";

type RouteContext = {
  params: { id: string };
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const collection = await collectionService.getCollection(
      user.id,
      validateId(params.id),
    );
    return apiSuccess(collection);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    const body = await validateBody(request, updateCollectionSchema);
    const collection = await collectionService.updateCollection(
      user.id,
      validateId(params.id),
      body,
      getRequestContext(request),
    );
    return apiSuccess(collection);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireAuth();
    await checkRateLimit(apiRateLimiter, getRateLimitIdentifier(request, user.id));
    await collectionService.deleteCollection(
      user.id,
      validateId(params.id),
      getRequestContext(request),
    );
    return apiSuccess({ id: params.id });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
