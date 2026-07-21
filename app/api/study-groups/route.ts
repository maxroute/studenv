import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createStudyGroupSchema } from "@/lib/models/study-group.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as studyGroupService from "@/lib/services/study-group.service";

export async function GET() {
  try {
    const user = await requireAuth();
    const groups = await studyGroupService.listStudyGroups(user.id);
    return apiSuccess(groups);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    const body = await validateBody(request, createStudyGroupSchema);
    const group = await studyGroupService.createStudyGroup(user.id, body);
    return apiSuccess(group, { status: 201 });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
