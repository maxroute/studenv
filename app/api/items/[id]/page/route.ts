import type { NextRequest } from "next/server";
import { validateId } from "@/lib/security/validate";
import * as noteService from "@/lib/services/note.service";
import { handleNoteRequest } from "../../../notes/handle";

type RouteContext = { params: { id: string } };

/** The page of a Shelf item (note, PDF, video or link), created the first time it is opened. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, (user) => noteService.openPageForItem(user.id, validateId(params.id)));
}
