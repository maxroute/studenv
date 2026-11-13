import type { NextRequest } from "next/server";
import { validateId } from "@/lib/security/validate";
import * as noteService from "@/lib/services/note.service";
import { handleNoteRequest } from "../../../handle";

type RouteContext = { params: { id: string; revisionId: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, (user) =>
    noteService.getRevision(user.id, validateId(params.id), validateId(params.revisionId)),
  );
}
