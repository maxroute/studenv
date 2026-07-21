import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { fetchYouTubeTranscript } from "@/lib/services/ai-ingest.service";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { url, type } = body;

    if (!url || !type) {
      return NextResponse.json({ error: "URL and type are required" }, { status: 400 });
    }

    if (type === "youtube") {
      const transcript = await fetchYouTubeTranscript(url);
      return NextResponse.json({ transcript });
    }

    // Expand for PDF buffer if needed. Typically PDFs are uploaded as multipart form data.
    return NextResponse.json({ error: "Unsupported type" }, { status: 400 });

  } catch (error: any) {
    console.error("[AI Ingest Error]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
