
"use client";

const DEFAULT_PART_SIZE = 10 * 1024 * 1024; // 10 MB
const UPLOAD_CONCURRENCY = 3;
const MAX_PART_RETRIES = 3;

type UploadedPart = {
    PartNumber: number;
    ETag: string;
};

type MultipartStartResponse = {
    success: boolean;
    sessionToken: string;
    partSize: number;
    totalParts: number;
};

type MultipartPartUrlResponse = {
    success: boolean;
    uploadUrl: string;
};

export type MultipartUploadResult = {
    assetId: string;
    revisionId: string;
    storageKey: string;
    sizeBytes: number;
    contentType: string;
};

async function readJson<T>(response: Response): Promise<T> {
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            payload.error || payload.message || `Request failed (${response.status})`,
        );
    }

    return payload as T;
}

async function uploadPart(
    sessionToken: string,
    file: File,
    partNumber: number,
    partSize: number,
    signal?: AbortSignal,
): Promise<UploadedPart> {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, file.size);
    const blob = file.slice(start, end);

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_PART_RETRIES; attempt += 1) {
        if (signal?.aborted) {
            throw new DOMException("Upload cancelled", "AbortError");
        }

        try {
            const urlResponse = await fetch("/api/storage/multipart/part-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionToken, partNumber }),
                signal,
            });

            const { uploadUrl } =
                await readJson<MultipartPartUrlResponse>(urlResponse);

            const uploadResponse = await fetch(uploadUrl, {
                method: "PUT",
                body: blob,
                signal,
            });

            if (!uploadResponse.ok) {
                throw new Error(`Part ${partNumber} upload failed (${uploadResponse.status})`);
            }

            const etag = uploadResponse.headers.get("ETag");

            if (!etag) {
                throw new Error(
                    "The storage server did not expose the ETag response header. Check the bucket CORS settings.",
                );
            }

            return { PartNumber: partNumber, ETag: etag };
        } catch (error) {
            lastError = error;

            if (signal?.aborted || attempt === MAX_PART_RETRIES) {
                throw error;
            }

            await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error(`Part ${partNumber} upload failed`);
}

export async function uploadWorkspaceAsset(
    file: File,
    signal?: AbortSignal,
): Promise<MultipartUploadResult> {
    if (!file || file.size <= 0) {
        throw new Error("Please select a non-empty file.");
    }

    const contentType = file.type || "application/octet-stream";

    const startResponse = await fetch("/api/storage/multipart/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            filename: file.name || "asset.bin",
            sizeBytes: file.size,
            contentType,
        }),
        signal,
    });

    const startData = await readJson<MultipartStartResponse>(startResponse);

    if (
        !startData.sessionToken ||
        !Number.isSafeInteger(startData.partSize) ||
        startData.partSize <= 0 ||
        !Number.isSafeInteger(startData.totalParts) ||
        startData.totalParts <= 0
    ) {
        throw new Error("The server returned an invalid multipart upload session.");
    }

    try {
        const parts: UploadedPart[] = new Array(startData.totalParts);
        let nextPart = 1;

        const workers = Array.from(
            { length: Math.min(UPLOAD_CONCURRENCY, startData.totalParts) },
            async () => {
                while (true) {
                    if (signal?.aborted) {
                        throw new DOMException("Upload cancelled", "AbortError");
                    }

                    const partNumber = nextPart++;

                    if (partNumber > startData.totalParts) {
                        return;
                    }

                    parts[partNumber - 1] = await uploadPart(
                        startData.sessionToken,
                        file,
                        partNumber,
                        startData.partSize,
                        signal,
                    );
                }
            },
        );

        await Promise.all(workers);

        const completeResponse = await fetch("/api/storage/multipart/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sessionToken: startData.sessionToken,
                parts,
            }),
            signal,
        });

        const result = await readJson<MultipartUploadResult & { success: boolean }>(
            completeResponse,
        );

        if (!result.assetId || !result.revisionId || !result.storageKey) {
            throw new Error(
                "Upload completed, but the server returned incomplete asset details.",
            );
        }

        return {
            assetId: result.assetId,
            revisionId: result.revisionId,
            storageKey: result.storageKey,
            sizeBytes: result.sizeBytes,
            contentType: result.contentType,
        };
    } catch (error) {
        // Abort the unfinished upload. Do not reuse the cancelled signal here.
        try {
            await fetch("/api/storage/multipart/abort", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionToken: startData.sessionToken,
                }),
            });
        } catch (abortError) {
            console.error("Could not abort multipart upload:", abortError);
        }

        throw error;
    }

}
