import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/security/headers";
import { checkRateLimit, extractRateLimiter } from "@/lib/security/rateLimit";
import {
  getErrorResponse,
  getRateLimitIdentifier,
} from "@/lib/security/request";
import { sanitizeUrl } from "@/lib/security/sanitize";
import { requireJsonContentType, validateBody } from "@/lib/security/validate";

const extractSchema = z
  .object({
    url: z.string().trim().min(1).max(2000),
  })
  .strict();

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "SecondBrainBot/1.0 (+metadata extraction)",
      },
    });

    if (!response.ok || !response.body) {
      throw new Error("Unable to fetch URL metadata.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let html = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      size += value.byteLength;

      if (size > 2 * 1024 * 1024) {
        throw new Error("Response exceeded 2 MB limit.");
      }

      html += decoder.decode(value, { stream: true });
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireJsonContentType(request);
    const user = await requireAuth();
    await checkRateLimit(
      extractRateLimiter,
      getRateLimitIdentifier(request, user.id),
    );
    const body = await validateBody(request, extractSchema);
    const url = sanitizeUrl(body.url);

    if (!url) {
      throw Object.assign(new Error("Invalid URL."), { status: 400 });
    }

    const html = await fetchHtml(url);
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();

    const title =
      article?.title?.trim() ||
      dom.window.document.querySelector("title")?.textContent?.trim() ||
      "";
    const excerpt =
      article?.excerpt?.trim() ||
      dom.window.document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content")
        ?.trim() ||
      "";
    const faviconHref =
      dom.window.document
        .querySelector('link[rel*="icon"]')
        ?.getAttribute("href")
        ?.trim() ?? null;
    const favicon = faviconHref
      ? sanitizeUrl(new URL(faviconHref, url).toString())
      : null;

    return apiSuccess({
      title,
      excerpt,
      byline: article?.byline ?? null,
      siteName: article?.siteName ?? null,
      favicon,
      sourceHost: new URL(url).hostname,
    });
  } catch (error) {
    const err = getErrorResponse(error);
    return apiError(err.message, err.status, err.details);
  }
}
