import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const workerPath = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "build",
  "pdf.worker.min.mjs",
);

export async function GET() {
  try {
    const worker = await fs.readFile(workerPath, "utf8");

    return new NextResponse(worker, {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to load pdf.js worker", error);
    return NextResponse.json({ error: "Failed to load PDF worker" }, { status: 500 });
  }
}
