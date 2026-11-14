"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ExternalLink, FileText, Globe, LayoutDashboard, Loader2, Music, PlayCircle, StickyNote } from "lucide-react";
import { parseRef } from "@/lib/refs/ref-grammar";
import { buildYouTubeEmbedUrl, getYouTubePlaybackSource } from "@/lib/utils/youtube";
import { isDirectMediaLikeUrl } from "@/lib/utils/asset-links";
import { NotePdfViewer } from "./note-pdf-viewer";
import { renderPdfPage } from "./pdf-render";

type Resolved =
  | { kind: "loading" }
  | { kind: "missing"; message: string }
  | { kind: "pdf"; title: string; assetId: string | null; itemId?: string; host?: string }
  | { kind: "image"; title: string; src: string }
  | { kind: "video"; title: string; src: string; youtube: string | null; host?: string }
  | { kind: "audio"; title: string; src: string }
  | { kind: "web"; title: string; url: string; host: string; excerpt?: string | null }
  | { kind: "page"; title: string; href: string; icon: "note" | "workspace" };

type ItemData = { id: string; type: string; title: string; url?: string | null; excerpt?: string | null; noteId?: string | null };
type AssetData = { id: string; title: string; kind: string; contentUrl: string; sourceUrl?: string | null; sourceHost?: string | null };

async function getJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(typeof json?.error === "string" ? json.error : "Not available");
    Object.assign(error, { status: response.status });
    throw error;
  }
  // Most routes answer { ok, data }; the asset route answers the object itself.
  return json && typeof json === "object" && "data" in json && "ok" in json ? json.data : json;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const IMAGE_URL = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;

function useResolved(ref: string | null): Resolved {
  const parsed = ref ? parseRef(ref) : null;
  const type = parsed?.type;
  const id = parsed?.id;
  const item = useSWR<ItemData>(type === "item" && id ? `/api/items/${id}` : null, getJson, { revalidateOnFocus: false });
  const itemAsset = useSWR<{ assetId: string }>(
    type === "item" && id && item.data?.type === "pdf" ? `/api/items/${id}/asset` : null,
    (url: string) => getJson(url, { method: "POST" }),
    { revalidateOnFocus: false },
  );
  const asset = useSWR<AssetData>(type === "asset" && id ? `/api/assets/${id}` : null, getJson, { revalidateOnFocus: false });
  const notes = useSWR<Array<{ id: string; title: string }>>(type === "note" ? "/api/notes" : null, getJson, { revalidateOnFocus: false });
  const workspaces = useSWR<Array<{ id: string; title: string }>>(type === "workspace" ? "/api/workspace" : null, getJson, { revalidateOnFocus: false });

  if (!parsed || !id) return { kind: "missing", message: "This block points at nothing." };

  if (type === "item") {
    if (item.error) return { kind: "missing", message: "This Shelf item was deleted or is not yours." };
    const data = item.data;
    if (!data) return { kind: "loading" };
    const title = data.title || "Untitled";
    const url = data.url ?? "";
    if (data.type === "note" && data.noteId) return { kind: "page", title, href: `/notes/${data.noteId}`, icon: "note" };
    if (data.type === "pdf") return { kind: "pdf", title, assetId: itemAsset.data?.assetId ?? null, itemId: data.id, host: url ? hostOf(url) : undefined };
    if (data.type === "video") {
      const source = getYouTubePlaybackSource(url);
      const youtube = source ? buildYouTubeEmbedUrl(source, { host: "youtube-nocookie", nativeControls: true }) : null;
      if (youtube || isDirectMediaLikeUrl(url)) return { kind: "video", title, src: url, youtube, host: hostOf(url) };
    }
    if (url && IMAGE_URL.test(url)) return { kind: "image", title, src: url };
    return { kind: "web", title, url, host: url ? hostOf(url) : "", excerpt: data.excerpt };
  }

  if (type === "asset") {
    if (asset.error) return { kind: "missing", message: "This file was deleted or is not yours." };
    const data = asset.data;
    if (!data) return { kind: "loading" };
    const title = data.title || "Untitled";
    if (data.kind === "pdf") return { kind: "pdf", title, assetId: data.id };
    if (data.kind === "image") return { kind: "image", title, src: data.contentUrl };
    if (data.kind === "audio") return { kind: "audio", title, src: data.contentUrl };
    if (data.kind === "video") {
      const source = getYouTubePlaybackSource(data.contentUrl);
      const youtube = source ? buildYouTubeEmbedUrl(source, { host: "youtube-nocookie", nativeControls: true }) : null;
      return { kind: "video", title, src: data.contentUrl, youtube, host: data.sourceHost ?? undefined };
    }
    const url = data.sourceUrl ?? data.contentUrl;
    return { kind: "web", title, url, host: data.sourceHost ?? hostOf(url) };
  }

  if (type === "note") {
    if (notes.error) return { kind: "missing", message: "This page could not be loaded." };
    if (!notes.data) return { kind: "loading" };
    const note = notes.data.find((entry) => entry.id === id);
    return note ? { kind: "page", title: note.title || "Untitled", href: `/notes/${id}`, icon: "note" } : { kind: "missing", message: "This page was deleted." };
  }

  if (type === "workspace") {
    if (workspaces.error) return { kind: "missing", message: "This workspace could not be loaded." };
    if (!workspaces.data) return { kind: "loading" };
    const workspace = workspaces.data.find((entry) => entry.id === id);
    return workspace
      ? { kind: "page", title: workspace.title || "Untitled workspace", href: `/workspaces/${id}`, icon: "workspace" }
      : { kind: "missing", message: "This workspace was deleted." };
  }

  return { kind: "missing", message: `“${ref}” cannot be shown here yet.` };
}

/** The view of an `embed` block: whatever the reference points at, shown as what it is. */
export function ResourceEmbedView({ node, editor, getPos, selected }: NodeViewProps) {
  const ref = typeof node.attrs.ref === "string" ? node.attrs.ref : null;
  const resolved = useResolved(ref);

  return (
    <NodeViewWrapper className={`note-resource${selected ? " selected" : ""}`} data-embed="" data-note-interactive="">
      {resolved.kind === "loading" ? (
        <div className="note-resource-card muted"><Loader2 size={16} className="note-spin" /> Loading…</div>
      ) : resolved.kind === "missing" ? (
        <div className="note-resource-card muted">{resolved.message}</div>
      ) : resolved.kind === "pdf" ? (
        <PdfCard
          title={resolved.title}
          assetId={resolved.assetId}
          host={resolved.host}
          onPin={(page) => {
            if (!resolved.assetId) return;
            const pos = getPos();
            if (typeof pos !== "number") return;
            editor
              .chain()
              .insertContentAt(pos + node.nodeSize, { type: "pdfPage", attrs: { assetId: resolved.assetId, page, title: resolved.title, strokes: [] } })
              .run();
          }}
          canPin={editor.isEditable}
        />
      ) : resolved.kind === "image" ? (
        <figure className="note-resource-image">
          {/* Remote and presigned URLs: next/image cannot optimise these. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolved.src} alt={resolved.title} loading="lazy" draggable={false} />
          <figcaption>{resolved.title}</figcaption>
        </figure>
      ) : resolved.kind === "video" ? (
        <div className="note-resource-media">
          {resolved.youtube ? (
            <iframe
              src={resolved.youtube}
              title={resolved.title}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : (
            <video src={resolved.src} controls preload="metadata" playsInline />
          )}
          <div className="note-resource-caption"><PlayCircle size={14} /> {resolved.title}</div>
        </div>
      ) : resolved.kind === "audio" ? (
        <div className="note-resource-card">
          <Music size={18} />
          <div className="note-resource-text">
            <span className="note-resource-title">{resolved.title}</span>
            <audio src={resolved.src} controls preload="metadata" />
          </div>
        </div>
      ) : resolved.kind === "web" ? (
        <a className="note-resource-card link" href={resolved.url} target="_blank" rel="noopener noreferrer">
          <Globe size={18} />
          <span className="note-resource-text">
            <span className="note-resource-title">{resolved.title}</span>
            {resolved.excerpt ? <span className="note-resource-detail">{resolved.excerpt}</span> : null}
            <span className="note-resource-host">{resolved.host}</span>
          </span>
          <ExternalLink size={14} />
        </a>
      ) : (
        <Link className="note-resource-card link" href={resolved.href}>
          {resolved.icon === "note" ? <StickyNote size={18} /> : <LayoutDashboard size={18} />}
          <span className="note-resource-text">
            <span className="note-resource-title">{resolved.title}</span>
            <span className="note-resource-host">{resolved.icon === "note" ? "Page" : "Workspace"}</span>
          </span>
        </Link>
      )}
    </NodeViewWrapper>
  );
}

/** A PDF as a card with its first page; opens the reader, where pages can be pinned. */
function PdfCard({ title, assetId, host, onPin, canPin }: { title: string; assetId: string | null; host?: string; onPin: (page: number) => void; canPin: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!assetId || !canvas) return;
    setState("loading");
    return renderPdfPage(assetId, 1, canvas, 132, (error) => setState(error ? "failed" : "ready"));
  }, [assetId]);

  return (
    <>
      <button
        type="button"
        className="note-resource-pdf"
        // Keep the note unfocused so the phone keyboard does not open under the reader.
        onPointerDown={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => assetId && setOpen(true)}
        disabled={!assetId}
        aria-label={`Open ${title}`}
      >
        <span className={`note-resource-pdf-thumb ${state}`}>
          <canvas ref={canvasRef} aria-hidden="true" />
          {state !== "ready" ? <FileText size={28} /> : null}
        </span>
        <span className="note-resource-text">
          <span className="note-resource-badge">PDF</span>
          <span className="note-resource-title">{title}</span>
          {host ? <span className="note-resource-host">{host}</span> : null}
          <span className="note-resource-action">{assetId ? (canPin ? "Open · pin pages here" : "Open") : "Preparing…"}</span>
        </span>
      </button>
      {open && assetId ? <NotePdfViewer assetId={assetId} title={title} onPin={canPin ? onPin : undefined} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
