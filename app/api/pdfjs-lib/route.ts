import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const pdfLibPath = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "build",
  "pdf.mjs",
);

export async function GET() {
  try {
    const lib = await fs.readFile(pdfLibPath, "utf8");

    return new NextResponse(lib, {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to load pdf.js library", error);
    return NextResponse.json({ error: "Failed to load PDF library" }, { status: 500 });
  }
}
