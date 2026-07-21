import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await req.arrayBuffer());
    const filePath = path.join(process.cwd(), "public", "uploads", key);
    
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Local upload failed", e);
    return NextResponse.json({ error: "Failed to upload locally" }, { status: 500 });
  }
}
