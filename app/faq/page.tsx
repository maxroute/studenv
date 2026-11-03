import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import { createPublicPageMetadata } from "@/lib/seo/page-metadata";
import "@/components/layout/approved-homepage.css";

export const metadata = createPublicPageMetadata({
  title: "Frequently Asked Questions — Studenv",
  description: "Answers to common questions about Studenv, its features and what is planned.",
  path: "/faq",
});

export default function PublicPage() {
  return <ApprovedHomepage />;
}
