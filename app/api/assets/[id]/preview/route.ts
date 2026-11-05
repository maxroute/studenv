import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import * as assetService from "@/lib/services/asset.service";

function extractMetaTag(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const asset = await assetService.getAsset(params.id);

    if (asset.ownerId !== user.id) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    if (!asset.sourceUrl) {
      return NextResponse.json({ error: "No source URL available" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(asset.sourceUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
        return NextResponse.json({
          title: asset.title,
          description: null,
          image: null,
          siteName: asset.sourceHost ?? null,
          url: asset.sourceUrl,
          host: asset.sourceHost ?? null,
        });
      }

      const html = await response.text();
      const title = extractMetaTag(html, [
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
        /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
        /<title>([^<]+)<\/title>/i,
      ]);
      const description = extractMetaTag(html, [
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
        /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      ]);
      const image = extractMetaTag(html, [
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      ]);
      const siteName = extractMetaTag(html, [
        /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      ]);

      return NextResponse.json({
        title: decodeHtmlEntities(title || asset.title),
        description: description ? decodeHtmlEntities(description) : null,
        image,
        siteName: siteName ? decodeHtmlEntities(siteName) : asset.sourceHost ?? null,
        url: asset.sourceUrl,
        host: asset.sourceHost ?? null,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    console.error("[assets.preview] Failed to generate asset preview:", error);
    return NextResponse.json(
      { error: "A preview could not be generated for this asset." },
      { status: error.status || 500 },
    );
  }
}
