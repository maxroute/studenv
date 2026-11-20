"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Sparkles } from "lucide-react";
import { useNotePanelStore } from "@/hooks/use-note-panel-store";
import { useRanganStore } from "@/hooks/use-rangan-store";
import type { OpenTarget } from "@/lib/rangan/citations";

const NotePdfViewer = dynamic(() => import("@/components/notes/note-pdf-viewer").then((mod) => mod.NotePdfViewer), { ssr: false });

type RelatedEntry = {
  ref: string;
  sourceType: string;
  title: string;
  heading: string;
  snippet: string;
  similarity: number;
  open: OpenTarget | null;
};

const TYPE_LABEL: Record<string, string> = { note: "Page", pdf: "PDF", transcript: "Video", item: "Shelf" };

async function fetcher(url: string) {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Related material could not be loaded.");
  return json.data as RelatedEntry[];
}

/** Where in the source the closest passage is: "p. 4", a heading, or nothing. */
function placeLabel(entry: RelatedEntry) {
  if (entry.open?.kind === "pdf") return `p. ${entry.open.page}`;
  return entry.heading && entry.heading !== entry.title ? entry.heading : "";
}

/**
 * "Related in your library": the student's other material closest in meaning
 * to this page that it doesn't link to yet. Free: no Rangan question is used
 * until the student asks how two things connect.
 */
export function RelatedInLibrary({ noteId, title, embedded = false }: { noteId: string; title: string; embedded?: boolean }) {
  const router = useRouter();
  const { data } = useSWR(`/api/rangan/related?ref=${encodeURIComponent(`note:${noteId}`)}`, fetcher, { revalidateOnFocus: false });
  const [pdf, setPdf] = useState<{ assetId: string; title: string; page: number } | null>(null);
  if (!data || data.length === 0) return null;

  const open = (entry: RelatedEntry) => {
    const target = entry.open;
    if (!target) return;
    if (target.kind === "pdf") {
      setPdf({ assetId: target.assetId, title: entry.title, page: target.page });
      return;
    }
    if (target.kind === "note") {
      // On a board, stay on the board: the page opens in its side panel.
      if (embedded) useNotePanelStore.getState().open(target.noteId);
      else router.push(`/notes/${encodeURIComponent(target.noteId)}${target.blockId ? `#${target.blockId}` : ""}`);
      return;
    }
    if (target.kind === "web") {
      window.open(target.url, "_blank", "noopener,noreferrer");
      return;
    }
    const href = `/shelf/${encodeURIComponent(target.itemId)}`;
    if (embedded) window.open(href, "_blank", "noopener");
    else router.push(href);
  };

  const askHow = (entry: RelatedEntry) => {
    const store = useRanganStore.getState();
    store.openPanel();
    void store.ask(`How does my page "${title || "Untitled"}" connect to "${entry.title}"?`);
  };

  return (
    <section className="appears-in related-in-library" aria-label="Related in your library">
      <h3 className="appears-in-title">Related in your library</h3>
      <ul className="related-list">
        {data.map((entry) => {
          const place = placeLabel(entry);
          return (
            <li key={entry.ref} className="related-item">
              <button type="button" className="related-open" onClick={() => open(entry)} disabled={!entry.open}>
                <span className="related-head">
                  <span className="appears-in-type">{TYPE_LABEL[entry.sourceType] ?? entry.sourceType}</span>
                  <span className="related-title">{entry.title || "Untitled"}</span>
                  {place ? <span className="appears-in-details">{place}</span> : null}
                </span>
                <span className="related-snippet">{entry.snippet}</span>
              </button>
              <button type="button" className="related-ask" onClick={() => askHow(entry)} title="Uses one Rangan question">
                <Sparkles size={13} aria-hidden /> How do these connect?
              </button>
            </li>
          );
        })}
      </ul>
      {pdf ? <NotePdfViewer assetId={pdf.assetId} title={pdf.title} initialPage={pdf.page} onClose={() => setPdf(null)} /> : null}
    </section>
  );
}
