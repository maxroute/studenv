import type { NextRequest } from "next/server";
import { createNoteSchema } from "@/lib/models/note.model";
import { getRequestContext } from "@/lib/security/request";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";
import * as noteService from "@/lib/services/note.service";
import { handleNoteRequest } from "./handle";

export async function GET(request: NextRequest) {
  return handleNoteRequest(request, (user) => noteService.listNotes(user.id));
}

export async function POST(request: NextRequest) {
  return handleNoteRequest(
    request,
    async (user) => {
      await requireJsonContentType(request);
      const body = await validateBody(request, createNoteSchema);
      return noteService.createNote(user.id, user.plan, body, getRequestContext(request));
    },
    { status: 201 },
  );
}
