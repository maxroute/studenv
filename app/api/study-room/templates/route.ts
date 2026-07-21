import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import {
  saveStudyRoomTemplatesSchema,
} from "@/lib/models/study-group.model";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as studyRoomTemplateService from "@/lib/services/study-room-template.service";

export async function GET() {
  try {
    const user = await requireAuth();
    const templates = await studyRoomTemplateService.listStudyRoomTemplates(user.id);
    return apiSuccess(templates);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    const body = await validateBody(request, saveStudyRoomTemplatesSchema);
    const templates = await studyRoomTemplateService.saveStudyRoomTemplates(user.id, body);
    return apiSuccess(templates);
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
