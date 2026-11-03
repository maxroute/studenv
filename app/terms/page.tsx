import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import { createPublicPageMetadata } from "@/lib/seo/page-metadata";
import "@/components/layout/approved-homepage.css";

export const metadata = createPublicPageMetadata({
  title: "Terms of Service — Studenv",
  description: "Read the terms that apply when you access or use Studenv.",
  path: "/terms",
});

export default function PublicPage() {
  return <ApprovedHomepage />;
}
