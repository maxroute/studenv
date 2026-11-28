import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse } from "@/lib/security/request";
import { validateId } from "@/lib/security/validate";
import * as studyGroupService from "@/lib/services/study-group.service";
import { readUpTo } from "@/lib/study-groups/inbox";

/** Marks a group read up to the newest message the member saw: { upTo: ISO time }. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.id);
    const body = (await request.json().catch(() => null)) as { upTo?: unknown } | null;
    const upTo = readUpTo(body?.upTo, new Date());
    if (!upTo) return apiError("Say how far you have read.", 400);
    await studyGroupService.markStudyGroupRead(user.id, groupId, upTo);
    return apiSuccess({ read: true });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
