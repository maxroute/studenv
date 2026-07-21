import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { subscribeToStudyRoomEvent } from "@/lib/services/study-room-events";
import * as studyGroupService from "@/lib/services/study-group.service";
import { validateId } from "@/lib/security/validate";
import { getErrorResponse } from "@/lib/security/request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const groupId = validateId(params.id);
    await studyGroupService.getStudyGroup(user.id, groupId);

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sendEvent = (event: string, data: string) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        };

        sendEvent("connected", JSON.stringify({ ok: true, groupId }));

        const unsubscribe = subscribeToStudyRoomEvent(groupId, () => {
          sendEvent("room_update", JSON.stringify({ groupId, at: new Date().toISOString() }));
        });

        const heartbeat = setInterval(() => {
          sendEvent("heartbeat", JSON.stringify({ at: new Date().toISOString() }));
        }, 25000);

        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          unsubscribe();
          controller.close();
        });
      },
      cancel() {
        return undefined;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const err = getErrorResponse(error);
    return Response.json(
      {
        ok: false,
        error: err.message,
        details: err.details,
      },
      { status: err.status },
    );
  }
}
