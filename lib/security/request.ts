import type { NextRequest } from "next/server";

export function getRequestContext(request: NextRequest) {
  return {
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.ip ??
      "unknown",
    userAgent: request.headers.get("user-agent"),
  };
}

export function getQueryObject(request: NextRequest) {
  return Object.fromEntries(request.nextUrl.searchParams.entries());
}

export function getRateLimitIdentifier(
  request: NextRequest,
  userId?: string | null,
) {
  return userId ?? getRequestContext(request).ip;
}

export function getErrorResponse(error: unknown) {
  const err = error as {
    cause?: { message?: string; name?: string };
    message?: string;
    name?: string;
    status?: number;
    details?: unknown;
  };
  const errorText = [
    err.name,
    err.message,
    err.cause?.name,
    err.cause?.message,
  ]
    .filter(Boolean)
    .join(" ");

  if (
    /authentication failed for user|can't reach database server|neondberror|prismaclientinitializationerror|prismaclientunknownrequesterror|connectorerror/i.test(
      errorText,
    )
  ) {
    return {
      message:
        process.env.NODE_ENV !== "production"
          ? "Database connection failed. Update DATABASE_URL with a valid Neon connection string or reset the Neon role password."
          : "Service temporarily unavailable. Please try again shortly.",
      status: 503,
      details: err.details,
    };
  }

  return {
    message: err.message ?? "Internal server error.",
    status: err.status ?? 500,
    details: err.details,
  };
}
