import type { NextRequest } from "next/server";
import { saveNoteSchema } from "@/lib/models/note.model";
import { getRequestContext } from "@/lib/security/request";
import { requireJsonContentType, validateBody, validateId } from "@/lib/security/validate";
import * as noteService from "@/lib/services/note.service";
import { handleNoteRequest } from "../handle";

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, (user) => noteService.getNote(user.id, validateId(params.id)));
}

/** Saves title and content; refused with 409 when `baseVersion` is not the current version. */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, async (user) => {
    await requireJsonContentType(request);
    const body = await validateBody(request, saveNoteSchema);
    return noteService.saveNote(user.id, validateId(params.id), body);
  });
}

/** Moves the note and its sub-pages to the trash. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, async (user) => {
    const id = validateId(params.id);
    await noteService.deleteNote(user.id, id, getRequestContext(request));
    return { id };
  });
}
