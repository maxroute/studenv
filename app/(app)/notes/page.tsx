import { redirect } from "next/navigation";
import { PAGES_TAB } from "@/lib/client/shell-nav";

/** The old Pages screen is now the Pages tab of the Library. */
export default function NotesPage() {
  redirect(PAGES_TAB);
}
