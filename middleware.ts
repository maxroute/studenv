import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  addCorsHeaders,
  addSecurityHeaders,
  apiError,
} from "@/lib/security/headers";
import {
  apiRateLimiter,
  authRateLimiter,
  checkRateLimit,
} from "@/lib/security/rateLimit";
import { getRateLimitIdentifier } from "@/lib/security/request";

const authSecret =
  process.env.NEXTAUTH_SECRET ||
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== "production"
    ? "second-brain-dev-secret-change-before-production"
    : undefined);

async function readSessionToken(request: NextRequest) {
  const cookieNames = [
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
  ];

  for (const cookieName of cookieNames) {
    const token = await getToken({
      req: request,
      secret: authSecret,
      cookieName,
    });

    if (token?.sub) {
      return token;
    }
  }

  return getToken({
    req: request,
    secret: authSecret,
  });
}

function shouldUseAuthRateLimiter(pathname: string, method: string) {
  if (pathname === "/api/auth/signup") return true;
  if (pathname === "/api/auth/forgot-password") return true;
  if (pathname === "/api/auth/reset-password") return true;
  if (pathname === "/api/user/change-password") return true;
  if (pathname.startsWith("/api/auth/session")) return false;
  if (pathname.startsWith("/api/auth/providers")) return false;
  if (pathname.startsWith("/api/auth/error")) return false;
  if (pathname.startsWith("/api/auth/csrf")) return false;
  if (pathname.startsWith("/api/auth/callback")) return false;
  if (pathname.startsWith("/api/auth/signin")) return false;
  return method === "POST" && pathname.startsWith("/api/auth/");
}

function getRateLimitStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return status === 429 ? 429 : null;
}

function getRetryAfterSeconds(error: unknown) {
  if (!error || typeof error !== "object" || !("details" in error)) {
    return null;
  }

  const details = (error as { details?: { reset?: unknown } }).details;
  const reset = details?.reset;

  if (typeof reset !== "number" || !Number.isFinite(reset)) {
    return null;
  }

  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}

export default async function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api/");

  if (request.method === "OPTIONS") {
    const response = NextResponse.json({}, { status: 200 });
    addSecurityHeaders(response);
    addCorsHeaders(response);
    return response;
  }

  if (isApiRoute) {
    let token: Awaited<ReturnType<typeof readSessionToken>> = null;

    // A session-cookie parsing problem must not be misreported as a rate-limit
    // rejection. Fall back to the IP identifier and still enforce a limit.
    try {
      token = await readSessionToken(request);
    } catch (error) {
      console.error(
        "[middleware] Session token lookup failed; applying IP-based rate limit.",
        error,
      );
    }

    const limiter = shouldUseAuthRateLimiter(pathname, request.method)
      ? authRateLimiter
      : apiRateLimiter;

    try {
      await checkRateLimit(
        limiter,
        getRateLimitIdentifier(
          request,
          typeof token?.sub === "string" ? token.sub : null,
        ),
      );
    } catch (error) {
      if (getRateLimitStatus(error) === 429) {
        const retryAfter = getRetryAfterSeconds(error);
        const response = apiError("Too many requests. Please try again later.", 429);
        if (retryAfter !== null) {
          response.headers.set("Retry-After", String(retryAfter));
        }
        addCorsHeaders(response);
        return response;
      }

      console.error("[middleware] Rate-limit check failed.", error);
      const response = apiError(
        "Request protection is temporarily unavailable. Please try again shortly.",
        503,
      );
      addCorsHeaders(response);
      return response;
    }
  }

  const response = NextResponse.next();
  addSecurityHeaders(response);

  if (isApiRoute) {
    addCorsHeaders(response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
