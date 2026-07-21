import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import {
  getDashboardStats,
  getWeeklyActivity,
  getRecentSessions,
} from "@/lib/services/analytics.service";

export const dynamic = "force-dynamic";

// ─── GET /api/analytics — Full analytics payload ──────────────
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [stats, weeklyActivity, recentSessions] = await Promise.all([
      getDashboardStats(session.user.id),
      getWeeklyActivity(session.user.id),
      getRecentSessions(session.user.id, 10),
    ]);

    return NextResponse.json({
      stats,
      weeklyActivity,
      recentSessions,
    });
  } catch (error: any) {
    console.error("GET /api/analytics error:", error);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 },
    );
  }
}
