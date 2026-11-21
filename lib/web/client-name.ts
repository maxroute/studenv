// ---------------------------------------------------------------------------
// How Rangan names itself to outside services
// ---------------------------------------------------------------------------
//
// Wikimedia refuses requests (HTTP 429) from clients that don't say who they
// are and how to reach them. Rangan names the public site as its contact:
// it is already public (search engines get it from robots and the sitemap).
// Nothing about the student is ever in it.

const PUBLIC_SITE_URL = "https://studenv-online.vercel.app";

export const RANGAN_USER_AGENT = `Studenv-Rangan/1.0 (${PUBLIC_SITE_URL}; study assistant)`;
