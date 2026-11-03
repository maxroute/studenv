import type { Metadata } from "next";
import { ApprovedHomepage } from "@/components/layout/approved-homepage";
import "@/components/layout/approved-homepage.css";
export const metadata: Metadata = {
 title: "Studenv — Your knowledge deserves a home",
 description: "Studenv is your personal learning environment. Capture what you learn, organize your knowledge and grow over time.",
};
export default function HomePage() { return <ApprovedHomepage />; }
