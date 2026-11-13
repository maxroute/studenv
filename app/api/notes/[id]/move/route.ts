import type { NextRequest } from "next/server";
import { moveNoteSchema } from "@/lib/models/note.model";
import { requireJsonContentType, validateBody, validateId } from "@/lib/security/validate";
import * as noteService from "@/lib/services/note.service";
import { handleNoteRequest } from "../../handle";

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, async (user) => {
    await requireJsonContentType(request);
    const body = await validateBody(request, moveNoteSchema);
    return noteService.moveNote(user.id, user.plan, validateId(params.id), body);
  });
}
