/**
 * Canonical public origin used by sitemap and robots metadata.
 * Configure NEXT_PUBLIC_WEBSITE_URL with the production website origin.
 */
export function getPublicSiteUrl(): URL {
  const configuredUrl =
    process.env.NEXT_PUBLIC_WEBSITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL;

  if (!configuredUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Set NEXT_PUBLIC_WEBSITE_URL to the canonical production website URL.",
      );
    }

    return new URL("http://localhost:3000");
  }

  return new URL("/", configuredUrl);
}
