import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import { createPublicPageMetadata } from "@/lib/seo/page-metadata";
import "@/components/layout/approved-homepage.css";

export const metadata = createPublicPageMetadata({
  title: "About Studenv — Studenv",
  description:
    "Learn about Studenv, a personal learning environment for capturing, organizing and growing your knowledge.",
  path: "/about",
});

export default function PublicPage() {
  return <ApprovedHomepage />;
}
