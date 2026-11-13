import type { NextRequest } from "next/server";
import { validateId } from "@/lib/security/validate";
import * as noteService from "@/lib/services/note.service";
import { handleNoteRequest } from "../../handle";

type RouteContext = { params: { id: string } };

/** Brings the note back from the trash. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, (user) => noteService.restoreNote(user.id, validateId(params.id)));
}
