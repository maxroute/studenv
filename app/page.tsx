import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Studenv — Your knowledge deserves a home",
  description:
    "Studenv is your personal learning environment. Capture what you learn, organize your knowledge and grow over time.",
};

export default function HomePage() {
  return (
    <iframe
      title="Studenv public website"
      src="/studenv-homepage-preview-v2.2.html"
      className="block h-[100dvh] w-full border-0"
      allow="clipboard-read; clipboard-write"
    />
  );
}
