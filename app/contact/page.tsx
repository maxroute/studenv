import type { Metadata } from "next";
import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import "@/components/layout/approved-homepage.css";

export const metadata: Metadata = {
  title: "Contact Studenv — Studenv",
  description: "Contact the Studenv team with questions, feedback and suggestions.",
  alternates: { canonical: "/contact" },
};

export default function PublicPage() {
  return <ApprovedHomepage />;
}
