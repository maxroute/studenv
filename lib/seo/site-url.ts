/**
 * Canonical public origin used by sitemap, robots, and page metadata.
 * Production deployments must set NEXT_PUBLIC_WEBSITE_URL explicitly.
 */
export function getPublicSiteUrl(): URL {
  const productionUrl = process.env.NEXT_PUBLIC_WEBSITE_URL;

  if (process.env.NODE_ENV === "production") {
    if (!productionUrl) {
      throw new Error(
        "Set NEXT_PUBLIC_WEBSITE_URL to the canonical production website URL.",
      );
    }

    return new URL("/", productionUrl);
  }

  const configuredUrl =
    productionUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";

  return new URL("/", configuredUrl);
}
