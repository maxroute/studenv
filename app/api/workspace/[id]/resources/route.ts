import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { getErrorResponse, getQueryObject } from "@/lib/security/request";
import { validateId, validateQuery } from "@/lib/security/validate";
import * as boardService from "@/lib/services/board.service";

type RouteContext = { params: { id: string } };

// `notes`: comma-separated ids of the notes the board's cards show (optional).
const querySchema = z
  .object({ notes: z.string().max(200 * 40).regex(/^[A-Za-z0-9_,-]*$/).optional() })
  .strict();

/** The vault's board sections: notes on the board and the resources they use. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireAuth();
    const { notes } = validateQuery(getQueryObject(request), querySchema);
    const noteIds = notes === undefined ? undefined : notes.split(",").filter(Boolean).slice(0, 200).map((id) => validateId(id));
    return apiSuccess(await boardService.boardResources(user.id, validateId(params.id), noteIds));
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
