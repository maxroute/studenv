import type { MetadataRoute } from "next";

/** What phones and computers use when Studenv is installed from the browser (and by the Android app). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Studenv",
    short_name: "Studenv",
    description: "Your library, boards, notes and study groups in one place.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/app/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/app/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
