import type { Metadata } from "next";
import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import "@/components/layout/approved-homepage.css";

export const metadata: Metadata = {
  title: "Privacy Policy — Studenv",
  description: "Read how Studenv handles information when you use the platform.",
  alternates: { canonical: "/privacy" },
};

export default function PublicPage() {
  return <ApprovedHomepage />;
}
