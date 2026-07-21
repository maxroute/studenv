import { spawn } from "child_process";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("Programmatic dev-db-generate triggered with scheduled process exit.");
    
    // Spawn a detached process that waits for Next.js to exit, then runs generate
    const child = spawn("cmd.exe", ["/c", "timeout /t 3 && npx prisma generate"], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    
    // Schedule Next.js process termination in 500ms
    setTimeout(() => {
      console.log("Exiting Next.js process to release file lock on query engine DLL...");
      process.exit(0);
    }, 500);
    
    return NextResponse.json({
      success: true,
      message: "Scheduled client generation. Next.js will shut down in 500ms. Please wait 5 seconds and restart Next.js using 'npm run dev' to continue."
    });
  } catch (error: any) {
    console.error("Scheduled generation trigger failed:", error);
    return NextResponse.json({
      success: false,
      error: error?.message || "Unknown error occurred"
    }, { status: 500 });
  }
}
