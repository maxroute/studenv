import type { Metadata } from "next";
import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import "@/components/layout/approved-homepage.css";

export const metadata: Metadata = {
  title: "Terms of Service — Studenv",
  description: "Read the terms that apply when you access or use Studenv.",
  alternates: { canonical: "/terms" },
};

export default function PublicPage() {
  return <ApprovedHomepage />;
}
