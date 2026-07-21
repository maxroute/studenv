import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs/promises";
import path from "path";

const isLocalStorage = !process.env.AWS_ACCESS_KEY_ID;
const LOCAL_STORAGE_PATH = path.join(process.cwd(), "public", "uploads");

const s3Client = !isLocalStorage ? new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
  endpoint: process.env.AWS_S3_ENDPOINT,
  forcePathStyle: !!process.env.AWS_S3_FORCE_PATH_STYLE,
}) : null;

const BUCKET_NAME = process.env.AWS_S3_BUCKET || "second-brain-assets";

export async function getUploadUrl(key: string, contentType: string, expiresIs = 3600) {
  if (isLocalStorage) {
    return `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/storage/local-upload?key=${key}`;
  }
  
  if (!s3Client) throw new Error("S3 client not initialized");
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresIs });
}

export async function getDownloadUrl(key: string, expiresIs = 3600) {
  if (isLocalStorage) {
    return `/uploads/${key}`;
  }

  if (!s3Client) throw new Error("S3 client not initialized");
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresIs });
}

export async function getFileBuffer(key: string) {
  if (isLocalStorage) {
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    return fs.readFile(filePath);
  }

  if (!s3Client) throw new Error("S3 client not initialized");
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);
  const body = response.Body;
  
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } else if (typeof (body as any).on === 'function') {
    // Node.js stream
    const chunks: any[] = [];
    for await (const chunk of body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } else if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  
  throw new Error("Unsupported body type from S3");
}

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string) {
  if (isLocalStorage) {
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    return fs.writeFile(filePath, buffer);
  }

  if (!s3Client) throw new Error("S3 client not initialized");
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  return s3Client.send(command);
}

export async function deleteObject(key: string) {
  if (isLocalStorage) {
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    try {
      await fs.unlink(filePath);
    } catch (e) {
      console.warn(`Local file delete failed for ${key}`, e);
    }
    return;
  }

  if (!s3Client) throw new Error("S3 client not initialized");
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return s3Client.send(command);
}
