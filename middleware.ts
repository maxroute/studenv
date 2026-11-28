import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  addCorsHeaders,
  addSecurityHeaders,
  apiError,
} from "@/lib/security/headers";
import {
  apiRateLimiter,
  checkRateLimit,
  resetPasswordIpLimiter,
  signupIpLimiter,
  verifyEmailIpLimiter,
} from "@/lib/security/rateLimit";
import { authIpBucket, retryMessage, type AuthIpBucket } from "@/lib/security/auth-limits";
import { getRateLimitIdentifier } from "@/lib/security/request";
import { REQUEST_PATH_HEADER, requestPathOf, signedInRedirect } from "@/lib/auth/signed-in-redirect";

/** Pages a signed-in visitor skips: the home page and the sign-in forms. */
const SIGNED_IN_SKIPS = new Set(["/", "/auth/signin", "/auth/signup"]);

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

/** Auth steps with their own limit per network address; the rest share the general API limit. */
const AUTH_IP_LIMITERS: Record<AuthIpBucket, typeof apiRateLimiter> = {
  signup: signupIpLimiter,
  "verify-email": verifyEmailIpLimiter,
  "reset-password": resetPasswordIpLimiter,
};

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

    const bucket = authIpBucket(pathname, request.method);
    const limiter = bucket ? AUTH_IP_LIMITERS[bucket] : apiRateLimiter;

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
        const response = apiError(
          retryAfter !== null ? retryMessage(Date.now() + retryAfter * 1000, Date.now(), bucket ? "attempts" : "requests") : "Too many requests. Please try again shortly.",
          429,
        );
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

  // Signed in, the home page and sign-in forms go straight into the app.
  if (!isApiRoute && request.method === "GET" && SIGNED_IN_SKIPS.has(pathname)) {
    let signedIn = false;
    try {
      signedIn = typeof (await readSessionToken(request))?.sub === "string";
    } catch {
      signedIn = false;
    }
    const destination = signedIn ? signedInRedirect(pathname, nextUrl.searchParams) : null;
    if (destination) {
      const redirect = NextResponse.redirect(new URL(destination, request.url));
      addSecurityHeaders(redirect);
      return redirect;
    }
  }

  // Pages learn which URL was opened, so a signed-out visitor returns to it after sign-in.
  let response: NextResponse;
  if (!isApiRoute) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(REQUEST_PATH_HEADER, requestPathOf(pathname, nextUrl.searchParams));
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next();
  }
  addSecurityHeaders(response);

  if (isApiRoute) {
    addCorsHeaders(response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
