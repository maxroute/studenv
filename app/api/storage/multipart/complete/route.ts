
import { MediaAssetKind, MediaAssetOrigin } from "@prisma/client";
import * as assetService from "@/lib/services/asset.service";
import { inferUploadAssetKind } from "@/lib/utils/media-assets";
import { getRequestContext } from "@/lib/security/request";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import {
    completeMultipartUpload,
    getObjectMetadata,
    listMultipartUploadParts,
    deleteObject,
} from "@/lib/storage/s3";
import { verifyUploadSession } from "@/lib/storage/upload-session";

export const runtime = "nodejs";

const PART_SIZE = 10 * 1024 * 1024;

type UploadedPart = {
    PartNumber: number;
    ETag: string;
};

export async function POST(req: NextRequest) {
    try {
        const user = await requireAuth();
        const body = await req.json();

        if (
            typeof body.sessionToken !== "string" ||
            !Array.isArray(body.parts)
        ) {
            return NextResponse.json(
                { error: "Invalid completion request." },
                { status: 400 },
            );
        }

        const session = verifyUploadSession(body.sessionToken, user.id);
        const expectedPartCount = Math.ceil(session.sizeBytes / PART_SIZE);

        if (body.parts.length !== expectedPartCount) {
            return NextResponse.json(
                { error: "The upload is incomplete. Some parts are missing." },
                { status: 400 },
            );
        }

        const parts: UploadedPart[] = body.parts;

        const validParts = parts.every((part, index) => {
            return (
                part &&
                part.PartNumber === index + 1 &&
                typeof part.ETag === "string" &&
                part.ETag.length > 0 &&
                part.ETag.length <= 200
            );
        });

        if (!validParts) {
            return NextResponse.json(
                { error: "The uploaded parts are invalid." },
                { status: 400 },
            );
        }

        const uploadedParts = await listMultipartUploadParts(
            session.key,
            session.uploadId,
        );

        if (uploadedParts.length !== expectedPartCount) {
            return NextResponse.json(
                { error: "Backblaze reports missing upload parts." },
                { status: 400 },
            );
        }

        for (let index = 0; index < expectedPartCount; index++) {
            const browserPart = parts[index];
            const storedPart = uploadedParts[index];

            const expectedSize =
                index === expectedPartCount - 1
                    ? session.sizeBytes - PART_SIZE * index
                    : PART_SIZE;

            if (
                storedPart.PartNumber !== browserPart.PartNumber ||
                storedPart.ETag !== browserPart.ETag ||
                storedPart.Size !== expectedSize
            ) {
                return NextResponse.json(
                    { error: "Uploaded part verification failed." },
                    { status: 400 },
                );
            }
        }

        await completeMultipartUpload(
            session.key,
            session.uploadId,
            parts,
        );

        const metadata = await getObjectMetadata(session.key);

        if (metadata.ContentLength !== session.sizeBytes) {
            console.error("Uploaded file size mismatch.", {
                expected: session.sizeBytes,
                received: metadata.ContentLength,
                key: session.key,
            });

            return NextResponse.json(
                { error: "Uploaded file size verification failed." },
                { status: 422 },
            );
        }


        const inferredKind = inferUploadAssetKind(
            session.contentType,
            session.title,
        );

        if (!inferredKind) {
            await deleteObject(session.key);
            return NextResponse.json(
                { error: "Unsupported asset type" },
                { status: 400 },
            );
        }

        const context = getRequestContext(req);

        const asset = await assetService.createAsset(
            {
                ownerId: user.id,
                kind: MediaAssetKind[inferredKind],
                origin: MediaAssetOrigin.upload,
                title: session.title,
                mimeType: session.contentType,
            },
            context,
        );

        const revision = await assetService.createRevision(
            {
                assetId: asset.id,
                storageKey: session.key,
                createdBy: user.id,
                sizeBytes: session.sizeBytes,
            },
            context,
        );

        return NextResponse.json({
            success: true,
            assetId: asset.id,
            revisionId: revision.id,
            storageKey: session.key,
            sizeBytes: session.sizeBytes,
            contentType: session.contentType,
        });

    } catch (error) {
        console.error("Multipart upload completion failed:", error);

        return NextResponse.json(
            { error: "Unable to complete the upload." },
            { status: 400 },
        );
    }
}
