import { notFound } from "next/navigation";
import { LibraryPage, type LibrarySection } from "@/components/library/library-page";

export const dynamic = "force-dynamic";

const SECTIONS: readonly LibrarySection[] = ["boards", "files", "tags", "collections", "storage"];

/** The full list behind a sidebar section heading. */
export default function LibrarySectionPage({ params }: { params: { section: string } }) {
  const section = SECTIONS.find((entry) => entry === params.section);
  if (!section) notFound();
  return <LibraryPage section={section} />;
}
