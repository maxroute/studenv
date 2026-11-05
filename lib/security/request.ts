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

const PUBLIC_SERVER_ERROR =
  "Something went wrong. Please try again shortly.";

function isSensitiveErrorMessage(message: string) {
  return /prisma|database|postgres|postgresql|neon|sqlstate|query engine|connection (?:refused|failed|timed out)|authentication failed for user|invalid .*connection string|environment variable|api[_ -]?key|secret|credential|stack trace|econn(?:refused|reset)|enotfound|socket hang up|internal server error/i.test(
    message,
  );
}

export function getErrorResponse(error: unknown) {
  const err =
    error && typeof error === "object"
      ? (error as {
          cause?: { message?: string; name?: string };
          message?: string;
          name?: string;
          status?: number;
          details?: unknown;
        })
      : {};

  const status =
    typeof err.status === "number" &&
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status <= 599
      ? err.status
      : 500;

  const message =
    typeof err.message === "string" ? err.message.trim() : "";

  // Validation errors and explicitly classified client errors may be shown.
  // Unknown exceptions and all server errors stay server-side.
  const isKnownClientError =
    status >= 400 &&
    status < 500 &&
    (err.name === "ValidationHttpError" ||
      status === 429 ||
      (message.length > 0 && !isSensitiveErrorMessage(message)));

  if (!isKnownClientError) {
    console.error("[api] Request failed:", error);
    return {
      message: PUBLIC_SERVER_ERROR,
      status: status >= 500 ? status : 500,
      details: undefined,
    };
  }

  // Only expose structured validation issues or the minimal retry timestamp.
  const details =
    err.name === "ValidationHttpError"
      ? err.details
      : status === 429 &&
          err.details &&
          typeof err.details === "object" &&
          "reset" in err.details &&
          typeof (err.details as { reset?: unknown }).reset === "number"
        ? { reset: (err.details as { reset: number }).reset }
        : undefined;

  return {
    message: message || "Please check your request and try again.",
    status,
    details,
  };
}
