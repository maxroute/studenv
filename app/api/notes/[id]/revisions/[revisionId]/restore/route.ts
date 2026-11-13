import type { NextRequest } from "next/server";
import { validateId } from "@/lib/security/validate";
import * as noteService from "@/lib/services/note.service";
import { handleNoteRequest } from "../../../../handle";

type RouteContext = { params: { id: string; revisionId: string } };

/** Restores an old revision as a new version, keeping the current content as a revision first. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, (user) =>
    noteService.restoreRevision(user.id, validateId(params.id), validateId(params.revisionId)),
  );
}
