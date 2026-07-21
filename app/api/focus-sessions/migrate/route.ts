import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { migrateFromLocalStorage } from "@/lib/services/session.service";

export const dynamic = "force-dynamic";

// ─── POST /api/focus-sessions/migrate — One-time localStorage migration ─
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { logs, dailyStats } = body;

    if (!logs && !dailyStats) {
      return NextResponse.json(
        { error: "No data to migrate" },
        { status: 400 },
      );
    }

    const result = await migrateFromLocalStorage(session.user.id, {
      logs: logs ?? [],
      dailyStats: dailyStats ?? {},
    });

    return NextResponse.json({
      success: true,
      migrated: result.migrated,
      skipped: result.skipped,
    });
  } catch (error: any) {
    console.error("POST /api/focus-sessions/migrate error:", error);
    return NextResponse.json(
      { error: "Migration failed" },
      { status: 500 },
    );
  }
}
