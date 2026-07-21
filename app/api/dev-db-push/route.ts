import { execSync } from "child_process";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("Programmatic dev-db-push test GET query...");
    
    // Try running a database query to see if schema works
    const testSession = await prisma.focusSession.findFirst().catch((err) => {
      return { error: err.message };
    });
    
    // Run db push with skip-generate to avoid file locking on Prisma generate
    let dbPushOutput = "skipped";
    try {
      dbPushOutput = execSync("npx prisma db push --skip-generate --accept-data-loss", { encoding: "utf8" });
    } catch (e: any) {
      dbPushOutput = `error: ${e.message} / stderr: ${e.stderr}`;
    }

    // Try query again after push
    const testSessionAfter = await prisma.focusSession.findFirst().catch((err) => {
      return { error: err.message };
    });

    return NextResponse.json({
      success: true,
      testSessionBefore: testSession,
      testSessionAfter: testSessionAfter,
      dbPushOutput
    });
  } catch (error: any) {
    console.error("Programmatic check failed:", error);
    return NextResponse.json({
      success: false,
      error: error?.message || "Unknown error occurred",
    }, { status: 500 });
  }
}
