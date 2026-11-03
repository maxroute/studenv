import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getPublicSiteUrl();

  return [
    {
      url: baseUrl.toString(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: new URL("/about", baseUrl).toString(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: new URL("/faq", baseUrl).toString(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: new URL("/contact", baseUrl).toString(),
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: new URL("/privacy", baseUrl).toString(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: new URL("/terms", baseUrl).toString(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
