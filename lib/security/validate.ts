import type { NextRequest } from "next/server";
import { ZodError, type z } from "zod";

const CUID_REGEX = /^c[a-z0-9]{24,}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ValidationHttpError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "ValidationHttpError";
    this.status = status;
    this.details = details;
  }
}

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export async function requireJsonContentType(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ValidationHttpError(
      "Content-Type must be application/json.",
      415,
    );
  }
}

async function readJsonBody<T>(request: NextRequest): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 100 * 1024) {
    throw new ValidationHttpError("Payload too large (limit 100KB).", 413);
  }

  try {
    const text = await request.text();
    if (text.length > 100 * 1024) {
      throw new ValidationHttpError("Payload too large (limit 100KB).", 413);
    }
    const json = JSON.parse(text);
    return json as T;
  } catch (err: any) {
    if (err instanceof ValidationHttpError) throw err;
    throw new ValidationHttpError("Invalid JSON payload.", 400);
  }
}

export async function validateBody<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T,
): Promise<z.infer<T>> {
  const body = await readJsonBody<unknown>(request);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationHttpError("Validation failed.", 400, {
      issues: formatZodError(parsed.error),
    });
  }

  return parsed.data;
}

export function validateQuery<T extends z.ZodTypeAny>(
  params: Record<string, unknown>,
  schema: T,
): z.infer<T> {
  const parsed = schema.safeParse(params);

  if (!parsed.success) {
    throw new ValidationHttpError("Invalid query params.", 400, {
      issues: formatZodError(parsed.error),
    });
  }

  return parsed.data;
}

export function validateId(id: string) {
  const value = id.trim();

  if (!CUID_REGEX.test(value) && !UUID_REGEX.test(value)) {
    throw new ValidationHttpError("Invalid resource id.", 400);
  }

  return value;
}
