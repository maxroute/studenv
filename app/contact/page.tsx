import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import { createPublicPageMetadata } from "@/lib/seo/page-metadata";
import "@/components/layout/approved-homepage.css";

export const metadata = createPublicPageMetadata({
  title: "Contact Studenv — Studenv",
  description: "Contact the Studenv team with questions, feedback and suggestions.",
  path: "/contact",
});

export default function PublicPage() {
  return <ApprovedHomepage />;
}
