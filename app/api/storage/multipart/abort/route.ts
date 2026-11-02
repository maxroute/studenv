
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { verifyUploadSession } from "@/lib/storage/upload-session";
import { abortMultipartUpload } from "@/lib/storage/s3";

export async function POST(req: NextRequest) {
    try {
        const user = await requireAuth();
        const body = await req.json();

        if (typeof body.sessionToken !== "string") {
            return NextResponse.json(
                { success: false, error: "Invalid upload session." },
                { status: 400 },
            );
        }

        const session = verifyUploadSession(body.sessionToken, user.id);

        await abortMultipartUpload(session.key, session.uploadId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Multipart abort failed:", error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Could not cancel upload.",
            },
            { status: 400 },
        );
    }
}
