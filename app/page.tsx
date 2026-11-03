import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import { createPublicPageMetadata } from "@/lib/seo/page-metadata";
import "@/components/layout/approved-homepage.css";

export const metadata = createPublicPageMetadata({
  title: "Studenv — Your knowledge deserves a home",
  description:
    "Studenv is your personal learning environment. Capture what you learn, organize your knowledge and grow over time.",
  path: "/",
});

export default function HomePage() {
  return <ApprovedHomepage />;
}
