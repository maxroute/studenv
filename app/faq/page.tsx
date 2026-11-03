import type { Metadata } from "next";
import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import "@/components/layout/approved-homepage.css";

export const metadata: Metadata = {
  title: "Frequently Asked Questions — Studenv",
  description: "Answers to common questions about Studenv, its features and what is planned.",
  alternates: { canonical: "/faq" },
};

export default function PublicPage() {
  return <ApprovedHomepage />;
}
