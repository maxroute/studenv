/**
 * Canonical public origin used by sitemap, robots, and page metadata.
 * NEXT_PUBLIC_WEBSITE_URL may override the default in other deployments.
 */
const DEFAULT_PUBLIC_SITE_URL = "https://studenv-online.vercel.app";

export function getPublicSiteUrl(): URL {
  const configuredUrl =
    process.env.NEXT_PUBLIC_WEBSITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    DEFAULT_PUBLIC_SITE_URL;

  return new URL("/", configuredUrl);
}
