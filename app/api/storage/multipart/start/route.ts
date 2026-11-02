
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAuth } from "@/lib/auth/session";
import { createMultipartUpload } from "@/lib/storage/s3";
import { createUploadSession } from "@/lib/storage/upload-session";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const PART_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/webm",
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
]);

export async function POST(req: NextRequest) {
    let uploadId: string | undefined;
    let key: string | undefined;

    try {
        const user = await requireAuth();
        const body = await req.json();

        const fileName =
            typeof body.fileName === "string" ? body.fileName.trim() : "";
        const contentType =
            typeof body.contentType === "string"
                ? body.contentType.trim().toLowerCase()
                : "application/octet-stream";
        const sizeBytes = body.sizeBytes;

        if (
            !fileName ||
            fileName.length > 255 ||
            fileName.includes("/") ||
            fileName.includes("\\")
        ) {
            return NextResponse.json(
                { error: "Invalid file name." },
                { status: 400 },
            );
        }

        if (
            !Number.isSafeInteger(sizeBytes) ||
            sizeBytes <= 0 ||
            sizeBytes > MAX_FILE_SIZE
        ) {
            return NextResponse.json(
                { error: "File size must be between 1 byte and 500 MB." },
                { status: 400 },
            );
        }

        if (!ALLOWED_TYPES.has(contentType)) {
            return NextResponse.json(
                { error: "This file type is not supported." },
                { status: 415 },
            );
        }

        const safeName = fileName
            .replace(/[^a-zA-Z0-9._-]/g, "-")
            .replace(/-+/g, "-")
            .slice(-120);

        key = `workspace/${user.id}/${randomUUID()}-${safeName}`;

        uploadId = await createMultipartUpload(key, contentType);

        const sessionToken = createUploadSession({
            userId: user.id,
            key,
            uploadId,
            sizeBytes,
            contentType,
            title: safeName,
        });

        return NextResponse.json({
            success: true,
            sessionToken,
            partSize: PART_SIZE,
            totalParts: Math.ceil(sizeBytes / PART_SIZE),
        });
    } catch (error) {
        if (uploadId && key) {
            // Best-effort cleanup if session creation fails.
            console.error("Multipart upload session creation failed.", error);
        }

        console.error("Failed to start multipart upload:", error);

        return NextResponse.json(
            { error: "Unable to start the upload." },
            { status: 500 },
        );
    }
}
