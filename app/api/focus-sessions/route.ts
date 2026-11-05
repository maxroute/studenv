import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { recordSession, getUserSessions, migrateFromLocalStorage, updateSessionGoal } from "@/lib/services/session.service";

export const dynamic = "force-dynamic";

// ─── POST /api/focus-sessions — Record a completed session ────
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type, durationMs, status, goal, startedAt, taskId } = body;

    // Validate required fields
    if (!type || !durationMs || !status) {
      return NextResponse.json(
        { error: "Missing required fields: type, durationMs, status" },
        { status: 400 },
      );
    }

    const result = await recordSession({
      userId: session.user.id,
      type,
      durationMs,
      status,
      goal: goal ?? null,
      startedAt: startedAt ?? null,
      taskId: taskId ?? null,
    });

    return NextResponse.json({
      success: true,
      sessionId: result.id,
      xpAwarded: result.xpAwarded,
    });
  } catch (error: any) {
    console.error("POST /api/focus-sessions error:", error);
    return NextResponse.json(
      { error: "Could not record your focus session. Please try again." },
      { status: 500 },
    );
  }
}

// ─── GET /api/focus-sessions — List user sessions ─────────────
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    const type = searchParams.get("type") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const result = await getUserSessions(session.user.id, {
      limit,
      offset,
      type,
      status,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("GET /api/focus-sessions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 },
    );
  }
}

// ─── PATCH /api/focus-sessions — Update session goal/title ──────
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, goal } = body;

    if (!id || typeof goal !== "string") {
      return NextResponse.json(
        { error: "Missing required fields: id, goal" },
        { status: 400 },
      );
    }

    await updateSessionGoal(session.user.id, id, goal);

    return NextResponse.json({ success: true, message: "Goal updated successfully" });
  } catch (error: any) {
    console.error("PATCH /api/focus-sessions error:", error);
    return NextResponse.json(
      { error: "Failed to update session goal" },
      { status: 500 },
    );
  }
}
