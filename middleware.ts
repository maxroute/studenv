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

  try {
    if (isApiRoute) {
      const token = await readSessionToken(request);
      const limiter = shouldUseAuthRateLimiter(pathname, request.method)
        ? authRateLimiter
        : apiRateLimiter;
      await checkRateLimit(
        limiter,
        getRateLimitIdentifier(request, typeof token?.sub === "string" ? token.sub : null),
      );
    }
  } catch (error) {
    return apiError("Too many requests.", 429, error);
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
