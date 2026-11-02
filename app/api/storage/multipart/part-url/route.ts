
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { getMultipartPartUploadUrl } from "@/lib/storage/s3";
import { verifyUploadSession } from "@/lib/storage/upload-session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    try {
        const user = await requireAuth();
        const body = await req.json();

        if (
            typeof body.sessionToken !== "string" ||
            !Number.isInteger(body.partNumber)
        ) {
            return NextResponse.json(
                { error: "Invalid upload request." },
                { status: 400 },
            );
        }

        const session = verifyUploadSession(body.sessionToken, user.id);
        const totalParts = Math.ceil(session.sizeBytes / (10 * 1024 * 1024));

        if (body.partNumber < 1 || body.partNumber > totalParts || body.partNumber > 10000) {
            return NextResponse.json(
                { error: "Invalid part number." },
                { status: 400 },
            );
        }

        const uploadUrl = await getMultipartPartUploadUrl(
            session.key,
            session.uploadId,
            body.partNumber,
        );

        return NextResponse.json({
            success: true,
            uploadUrl,
            partNumber: body.partNumber,
        });
    } catch (error) {
        console.error("Failed to create multipart part URL:", error);

        return NextResponse.json(
            { error: "Unable to prepare this upload part." },
            { status: 400 },
        );
    }
}
