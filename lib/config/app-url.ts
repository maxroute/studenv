/**
 * Resolve the public URL used in outbound email links.
 * NEXT_PUBLIC_APP_URL is authoritative; request origins can be 0.0.0.0
 * when the Next.js server is bound to all interfaces.
 */
export function getPublicAppUrl(requestOrigin?: string) {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL;

  const candidate = configured || requestOrigin;

  if (!candidate) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  }

  const url = new URL(candidate);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production.");
  }

  return url.origin;
}
