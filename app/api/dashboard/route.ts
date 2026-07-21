import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { apiRateLimiter, checkRateLimit } from "@/lib/security/rateLimit";
import { getRateLimitIdentifier } from "@/lib/security/request";
import { prisma } from "@/lib/db/prisma";
import {
  getDashboardStats,
  getRecentSessions,
} from "@/lib/services/analytics.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.id) {
      return NextResponse.json({
        viewer: { firstName: "there" },
        stats: { streak: 0, totalXP: 0, focusHours: 0 },
        recentSessions: [],
        upNext: {
          type: "Review",
          title: "Daily Review",
          description: "Sign in to see your pending items.",
          actionLabel: "Sign In",
          count: 0,
        },
      });
    }

    const sessionUser = session.user;

    try {
      await checkRateLimit(
        apiRateLimiter,
        getRateLimitIdentifier(request, sessionUser.id),
      );
    } catch (rlError) {
      console.warn("Rate limit exceeded for dashboard:", sessionUser.id);
      throw rlError;
    }

    try {
      // Use the centralized analytics service for all stats
      const [user, dashboardStats, recentFocusSessions, unreadCount] =
        await Promise.all([
          prisma.user.findUnique({
            where: { id: sessionUser.id },
            select: { name: true, username: true, email: true },
          }),
          getDashboardStats(sessionUser.id),
          getRecentSessions(sessionUser.id, 5),
          prisma.item.count({
            where: {
              userId: sessionUser.id,
              status: { in: ["unread", "reading"] },
            },
          }),
        ]);

      const focusHours = dashboardStats.totalFocusMs / 3600000;
      const displayName =
        user?.name ||
        user?.username ||
        sessionUser.name ||
        user?.email ||
        "Scholar";
      const firstName =
        String(displayName).trim().split(/\s+/)[0] || "Scholar";

      const SESSION_LABELS: Record<string, string> = {
        focus: "Focus",
        shortBreak: "Short break",
        longBreak: "Long break",
      };

      const dashboardData = {
        viewer: {
          firstName,
        },
        stats: {
          streak: dashboardStats.currentStreak,
          totalXP: dashboardStats.totalXp,
          focusHours: parseFloat(focusHours.toFixed(1)),
          // Extended stats for richer dashboard
          todaySessions: dashboardStats.todaySessions,
          todayFocusMs: dashboardStats.todayFocusMs,
          weekSessions: dashboardStats.weekSessions,
          longestStreak: dashboardStats.longestStreak,
          completionRate: dashboardStats.completionRate,
          productivityScore: dashboardStats.productivityScore,
        },
        // Recent sessions now come from FocusSession table (real timer data)
        recentSessions: recentFocusSessions.map((s) => {
          const durationMin = Math.round(s.durationMs / 60000);
          return {
            id: s.id,
            title: s.goal || SESSION_LABELS[s.type] || s.type,
            type: s.type,
            summary: `${SESSION_LABELS[s.type] || s.type} · ${durationMin} min`,
            createdAt: s.createdAt,
          };
        }),
        upNext: {
          type: "Review",
          title: "Daily Review",
          description: `You have ${unreadCount} items pending review in your library.`,
          actionLabel: "Start Review",
          count: unreadCount,
        },
      };

      return NextResponse.json(dashboardData);
    } catch (dbError) {
      console.error("DASHBOARD API DB ERROR:", dbError);

      return NextResponse.json({
        viewer: {
          firstName: sessionUser.name?.split(/\s+/)[0] || "Scholar",
        },
        stats: { streak: 0, totalXP: 0, focusHours: 0 },
        recentSessions: [],
        upNext: {
          type: "Review",
          title: "Daily Review",
          description: "We are syncing your items. Check back soon.",
          actionLabel: "View Library",
          count: 0,
        },
      });
    }
  } catch (error: any) {
    console.error("DASHBOARD API CRITICAL ERROR:", error);

    return NextResponse.json({
      viewer: { firstName: "Scholar" },
      stats: { streak: 0, totalXP: 0, focusHours: 0 },
      recentSessions: [],
      upNext: {
        type: "Error",
        title: "Service Unavailable",
        description: "Services are temporarily unavailable.",
        actionLabel: "Retry",
        count: 0,
      },
    });
  }
}
