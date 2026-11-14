import { NotesApp } from "@/components/notes/notes-app";

export const dynamic = "force-dynamic";

export default function NotePage({ params }: { params: { id: string } }) {
  return <NotesApp noteId={params.id} />;
}
