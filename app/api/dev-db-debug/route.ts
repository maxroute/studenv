import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {\n  if (process.env.NODE_ENV !== "development") {\n    return new NextResponse(null, { status: 404 });\n  }
  try {
    const sessions = await prisma.focusSession.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      success: true,
      count: sessions.length,
      sessions
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: "Database diagnostic failed."
    }, { status: 500 });
  }
}
