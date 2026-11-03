import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import { createPublicPageMetadata } from "@/lib/seo/page-metadata";
import "@/components/layout/approved-homepage.css";

export const metadata = createPublicPageMetadata({
  title: "Privacy Policy — Studenv",
  description: "Read how Studenv handles information when you use the platform.",
  path: "/privacy",
});

export default function PublicPage() {
  return <ApprovedHomepage />;
}
