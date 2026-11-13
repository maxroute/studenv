import type { NextRequest } from "next/server";
import { validateId } from "@/lib/security/validate";
import * as noteService from "@/lib/services/note.service";
import { handleNoteRequest } from "../../handle";

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, (user) => noteService.listRevisions(user.id, validateId(params.id)));
}

/** "Save version": a manual revision that retention never removes. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  return handleNoteRequest(request, (user) => noteService.saveVersion(user.id, validateId(params.id)), { status: 201 });
}
