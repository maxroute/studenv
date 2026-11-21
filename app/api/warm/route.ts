import { NextResponse } from "next/server";
import { ensureDatabaseReady } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/**
 * Public and tiny: opening the sign-in or home page calls this so the server
 * and the database are awake by the time the visitor has typed a password.
 * It takes no input and returns nothing about the data.
 */
export async function GET() {
  try {
    await ensureDatabaseReady();
  } catch {
    // Warming is best effort; a failure here must not say anything about the database.
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
