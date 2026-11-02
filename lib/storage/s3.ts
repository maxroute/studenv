
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs/promises";
import path from "path";

// Local filesystem storage is permitted only during development.
// Production must use configured object storage.
const hasAccessKey = Boolean(process.env.AWS_ACCESS_KEY_ID);
const hasSecretKey = Boolean(process.env.AWS_SECRET_ACCESS_KEY);

if (hasAccessKey !== hasSecretKey) {
  throw new Error(
    "Storage configuration is incomplete: both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required.",
  );
}

const isLocalStorage =
  process.env.NODE_ENV !== "production" && !hasAccessKey;

const LOCAL_STORAGE_PATH = path.resolve(
  process.cwd(),
  "public",
  "uploads",
);

const BUCKET_NAME = process.env.AWS_S3_BUCKET || "second-brain-assets";

let s3Client: S3Client | null = null;


export async function listMultipartUploadParts(
  key: string,
  uploadId: string,
) {
  if (!s3Client) {
    throw new Error("S3 client not initialized");
  }

  const result = await s3Client.send(
    new ListPartsCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    }),
  );

  return (result.Parts ?? []).map((part) => ({
    PartNumber: part.PartNumber,
    ETag: part.ETag,
    Size: part.Size,
  }));
}


function getS3Client(): S3Client {
  if (isLocalStorage) {
    throw new Error("S3 is not configured in local-storage mode.");
  }

  if (!hasAccessKey || !hasSecretKey) {
    throw new Error(
      "Object storage credentials are missing. Configure the B2 environment variables.",
    );
  }

  if (!process.env.AWS_REGION) {
    throw new Error("AWS_REGION is required for object storage.");
  }

  if (!process.env.AWS_S3_ENDPOINT) {
    throw new Error("AWS_S3_ENDPOINT is required for object storage.");
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      endpoint: process.env.AWS_S3_ENDPOINT,
      forcePathStyle:
        process.env.AWS_S3_FORCE_PATH_STYLE !== "false",
    });
  }

  return s3Client;
}

function getLocalFilePath(key: string): string {
  if (!key || key.includes("\0")) {
    throw new Error("Invalid storage key.");
  }

  const filePath = path.resolve(LOCAL_STORAGE_PATH, key);
  const allowedPrefix = `${LOCAL_STORAGE_PATH}${path.sep}`;

  if (!filePath.startsWith(allowedPrefix)) {
    throw new Error("Invalid storage key path.");
  }

  return filePath;
}

function assertStorageKey(key: string): void {
  if (
    typeof key !== "string" ||
    !key.trim() ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("\0") ||
    key.split("/").some((segment) => segment === ".." || segment === ".")
  ) {
    throw new Error("Invalid storage key.");
  }
}

// Existing single-file upload URL.
// Kept for compatibility with existing callers.
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600,
) {
  assertStorageKey(key);

  if (isLocalStorage) {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    return `${appUrl}/api/storage/local-upload?key=${encodeURIComponent(key)}`;
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn,
  });
}

// Existing private download URL.
export async function getDownloadUrl(
  key: string,
  expiresIn = 3600,
) {
  assertStorageKey(key);

  if (isLocalStorage) {
    return `/uploads/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn,
  });
}

// Returns the object body as a stream.
// Use this for large downloads instead of buffering the whole file.
export async function getFileStream(key: string) {
  assertStorageKey(key);

  if (isLocalStorage) {
    const filePath = getLocalFilePath(key);
    return fs.open(filePath, "r").then(async (handle) => {
      await handle.close();
      const { createReadStream } = await import("fs");
      return createReadStream(filePath);
    });
  }

  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error("Storage returned an empty response body.");
  }

  return response.Body;
}

// Existing buffer download.
// Keep for PDF processing and operations that genuinely need a Buffer.
// Avoid using this for large media delivery.
export async function getFileBuffer(key: string): Promise<Buffer> {
  assertStorageKey(key);

  if (isLocalStorage) {
    return fs.readFile(getLocalFilePath(key));
  }

  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error("Storage returned an empty response body.");
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

// Existing buffer upload.
// Keep this for smaller server-generated files and attachments.
export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  contentType: string,
) {
  assertStorageKey(key);

  if (isLocalStorage) {
    const filePath = getLocalFilePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    return fs.writeFile(filePath, buffer);
  }

  return getS3Client().send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

// Start a multipart upload.
export async function createMultipartUpload(
  key: string,
  contentType: string,
) {
  assertStorageKey(key);

  if (isLocalStorage) {
    throw new Error(
      "Multipart uploads require configured object storage.",
    );
  }

  const response = await getS3Client().send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    }),
  );

  if (!response.UploadId) {
    throw new Error("Storage did not return a multipart upload ID.");
  }

  return response.UploadId;
}

// Generate a short-lived URL for one part.
// The browser uploads the part directly to B2 using PUT.
export async function getMultipartPartUploadUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn = 3600,
) {
  assertStorageKey(key);

  if (!uploadId) {
    throw new Error("Missing multipart upload ID.");
  }

  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > 10000
  ) {
    throw new Error("Invalid multipart part number.");
  }

  const command = new UploadPartCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn,
  });
}

// Complete a multipart upload using the ETags returned by B2.
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>,
) {
  assertStorageKey(key);

  if (!uploadId || !Array.isArray(parts) || parts.length === 0) {
    throw new Error("Invalid multipart completion request.");
  }

  const sortedParts = [...parts].sort(
    (a, b) => a.PartNumber - b.PartNumber,
  );

  for (let index = 0; index < sortedParts.length; index += 1) {
    const part = sortedParts[index];

    if (
      !Number.isInteger(part.PartNumber) ||
      part.PartNumber !== index + 1 ||
      typeof part.ETag !== "string" ||
      !part.ETag.trim()
    ) {
      throw new Error("Invalid multipart part information.");
    }
  }

  return getS3Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts,
      },
    }),
  );
}

// Cancel an unfinished multipart upload.
export async function abortMultipartUpload(
  key: string,
  uploadId: string,
) {
  assertStorageKey(key);

  if (!uploadId) {
    throw new Error("Missing multipart upload ID.");
  }

  return getS3Client().send(
    new AbortMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    }),
  );
}

// Verify that a completed object exists and inspect its metadata.
export async function getObjectMetadata(key: string) {
  assertStorageKey(key);

  if (isLocalStorage) {
    const filePath = getLocalFilePath(key);
    const stat = await fs.stat(filePath);

    return {
      ContentLength: stat.size,
      ContentType: undefined,
      ETag: undefined,
    };
  }

  const response = await getS3Client().send(
    new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }),
  );

  return {
    ContentLength: response.ContentLength,
    ContentType: response.ContentType,
    ETag: response.ETag,
  };
}

// Existing object deletion.
export async function deleteObject(key: string) {
  assertStorageKey(key);

  if (isLocalStorage) {
    const filePath = getLocalFilePath(key);

    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }

    return;
  }

  return getS3Client().send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }),
  );
}
