import type { Metadata } from "next";
import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import "@/components/layout/approved-homepage.css";

export const metadata: Metadata = {
  title: "About Studenv — Studenv",
  description: "Learn about Studenv, a personal learning environment for capturing, organizing and growing your knowledge.",
  alternates: { canonical: "/about" },
};

export default function PublicPage() {
  return <ApprovedHomepage />;
}
