import { NextResponse } from "next/server";

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'; base-uri 'self'; img-src 'self' blob: data: https:; media-src 'self' blob: data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdn.tldraw.com data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://va.vercel-scripts.com https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com; frame-src 'self' blob: data: https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self' https:; worker-src 'self' blob:; object-src 'self' blob: data:;",
  "Strict-Transport-Security":
    "max-age=31536000; includeSubDomains; preload",
};

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": process.env.NEXT_PUBLIC_APP_URL || "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function addSecurityHeaders(response: NextResponse) {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export function addCorsHeaders(response: NextResponse) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export function apiSuccess(
  data: unknown,
  init?: ResponseInit & { cacheSeconds?: number },
) {
  const { cacheSeconds, ...responseInit } = init ?? {};
  const response = NextResponse.json(
    {
      ok: true,
      data,
    },
    responseInit,
  );

  if (cacheSeconds && cacheSeconds > 0) {
    response.headers.set(
      "Cache-Control",
      `private, max-age=0, stale-while-revalidate=${cacheSeconds}`,
    );
  }

  return addSecurityHeaders(response);
}

export function apiError(
  message: string,
  status = 400,
  details?: unknown,
  init?: ResponseInit,
) {
  const isServerError = status >= 500;
  const response = NextResponse.json(
    {
      ok: false,
      error: isServerError
        ? "Something went wrong. Please try again shortly."
        : message,
      details: isServerError ? undefined : details,
    },
    { status, ...init },
  );

  return addSecurityHeaders(response);
}
