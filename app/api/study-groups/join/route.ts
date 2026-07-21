import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { joinStudyGroupSchema } from "@/lib/models/study-group.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as studyGroupService from "@/lib/services/study-group.service";

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    const body = await validateBody(request, joinStudyGroupSchema);
    const group = await studyGroupService.joinStudyGroup(user.id, body);
    return apiSuccess(group);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
