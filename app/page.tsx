import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import { createPublicPageMetadata } from "@/lib/seo/page-metadata";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import "@/components/layout/approved-homepage.css";

const siteUrl = getPublicSiteUrl().toString();

const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Studenv",
  alternateName: "Studenv Online",
  url: siteUrl,
};

export const metadata = createPublicPageMetadata({
  title: "Studenv – Your Personal Online Study Environment",
  description:
    "Studenv is your personal online study environment to organize learning resources, manage notes, explore ideas and bring your study workflow together in one space. Build your second brain and make learning more organized.",
  path: "/",
});

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteStructuredData).replace(/</g, "\\u003c"),
        }}
      />
      <ApprovedHomepage />
    </>
  );
}
