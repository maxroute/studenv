import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { REF_MAX_LENGTH } from "@/lib/refs/ref-grammar";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getQueryObject } from "@/lib/security/request";
import { validateQuery } from "@/lib/security/validate";
import { appearsIn } from "@/lib/services/link-index.service";

const querySchema = z.object({ ref: z.string().min(3).max(REF_MAX_LENGTH) }).strict();

/** Everything of the caller's that points at `ref` (a note, a resource, a workspace card, …). */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { ref } = validateQuery(getQueryObject(request), querySchema);
    return apiSuccess(await appearsIn(user.id, ref));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
