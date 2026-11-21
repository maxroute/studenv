"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import toast from "react-hot-toast";
import { FileText, Globe, Image as ImageIcon, Loader2, Music, Video } from "lucide-react";
import { openItemPage } from "@/lib/client/open-item-page";
import { visibleShelfFiles, type ShelfFile } from "@/lib/library/shelf-files";

const KIND_LABEL: Record<ShelfFile["kind"], string> = { pdf: "pdf", video: "video", webpage: "link", image: "picture", audio: "audio" };

function KindIcon({ kind }: { kind: ShelfFile["kind"] }) {
  if (kind === "pdf") return <FileText size={14} aria-hidden />;
  if (kind === "video") return <Video size={14} aria-hidden />;
  if (kind === "webpage") return <Globe size={14} aria-hidden />;
  if (kind === "image") return <ImageIcon size={14} aria-hidden />;
  return <Music size={14} aria-hidden />;
}

async function fetchFiles(url: string): Promise<ShelfFile[]> {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  return response.ok && Array.isArray(json?.data) ? (json.data as ShelfFile[]) : [];
}

/**
 * Vault files that aren't on the Shelf yet: uploads, and links and videos
 * saved from boards, pages and Rangan. Opening a PDF, video or link puts it on
 * the Shelf (once), then opens it like any Shelf item; pictures and audio open
 * as they are.
 */
export function ShelfFiles({ filters, view, onShelved }: { filters: { nav?: string; tag?: string; status?: string; query?: string }; view: "grid" | "list"; onShelved: () => void }) {
  const router = useRouter();
  const { data, mutate } = useSWR("/api/shelf/files", fetchFiles);
  const [opening, setOpening] = useState<string | null>(null);
  const files = visibleShelfFiles(data ?? [], filters);
  if (!files.length) return null;

  const open = async (file: ShelfFile) => {
    if (opening) return;
    if (!file.shelvable) {
      window.open(`/api/assets/${encodeURIComponent(file.id)}/content`, "_blank", "noopener");
      return;
    }
    setOpening(file.id);
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(file.id)}/shelf`, { method: "POST" });
      const json = await response.json().catch(() => null);
      const itemId = json?.data?.itemId;
      if (!response.ok || typeof itemId !== "string") {
        toast.error(typeof json?.error === "string" ? json.error : "That file couldn't be opened.");
        return;
      }
      onShelved();
      void mutate();
      await openItemPage({ id: itemId }, router.push);
    } finally {
      setOpening(null);
    }
  };

  return (
    <section className="shelf-files" aria-label="Files from your boards and pages">
      <div className="shelf-files-head">
        <h2>Files from your boards and pages</h2>
        <p>Uploads, and links and videos saved on boards, in pages or by Rangan. Open one to add it to your Shelf.</p>
      </div>
      <div className={`cards-grid ${view === "list" ? "list-view" : ""}`}>
        {files.map((file, index) => (
          <div
            key={file.id}
            className={`card ${view === "list" ? "list-mode" : ""}`}
            role="button"
            tabIndex={0}
            aria-busy={opening === file.id}
            style={{ animationDelay: `${index * 0.035}s` }}
            onClick={() => void open(file)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                void open(file);
              }
            }}
          >
            <div className="card-type">
              <span className="type-badge file">
                <KindIcon kind={file.kind} /> {KIND_LABEL[file.kind]}
              </span>
              {opening === file.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            </div>
            <div className="card-title">{file.title}</div>
            <div className="card-excerpt">{file.sourceHost ?? (file.shelvable ? "Uploaded file" : "Opens in a new tab")}</div>
            <div className="card-footer">
              <div className="status-pill">{file.shelvable ? "Not on Shelf yet" : "Vault only"}</div>
              <div className="card-date">{new Date(file.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
