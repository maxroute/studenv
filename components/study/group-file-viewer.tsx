"use client";

/**
 * Opens a shared group file on top of the chat, so tapping a file doesn't leave
 * the group. PDFs are drawn with pdf.js (Android Chrome can't show a PDF inside a
 * page). Types with no preview aren't opened here; their card downloads them.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { groupFileDownloadUrl, previewKind, type PreviewKind } from "@/lib/study-groups/file-delivery";
import { getClientPdfJs } from "@/lib/utils/pdf";

export type ViewableFile = { url: string; name: string; mimeType: string };

/** Text larger than this is downloaded instead of shown. */
const MAX_TEXT_CHARS = 200_000;
/** Pages drawn at most; longer documents are read after downloading. */
const MAX_PDF_PAGES = 60;

export function GroupFileViewer({ file, onClose }: { file: ViewableFile; onClose: () => void }) {
  const kind = previewKind(file.mimeType);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    // The phone's Back button closes the viewer instead of leaving the chat.
    // Checked first, so an effect that runs twice doesn't leave a second entry behind.
    if (!window.history.state?.studenvFileViewer) window.history.pushState({ ...window.history.state, studenvFileViewer: true }, "");
    const onPop = () => closeRef.current();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") window.history.back();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return createPortal(
    <div className="group-viewer" role="dialog" aria-modal="true" aria-label={file.name}>
      <div className="group-viewer-head">
        <span className="group-viewer-name">{file.name}</span>
        <a className="group-viewer-btn" href={groupFileDownloadUrl(file.url)} download={file.name} aria-label={`Download ${file.name}`} title="Download">
          <Download aria-hidden="true" />
        </a>
        <button type="button" className="group-viewer-btn" onClick={() => window.history.back()} aria-label="Close">
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="group-viewer-body">
        <Preview file={file} kind={kind} />
      </div>
    </div>,
    document.body,
  );
}

function Preview({ file, kind }: { file: ViewableFile; kind: PreviewKind | null }) {
  const [failed, setFailed] = useState(false);
  if (failed || !kind) {
    return <p className="group-viewer-note">This file can&apos;t be shown here. Use the download button above.</p>;
  }
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- served by this app behind sign-in; next/image can't forward the session cookie
    return <img src={file.url} alt={file.name} onError={() => setFailed(true)} />;
  }
  if (kind === "video") return <video src={file.url} controls autoPlay playsInline onError={() => setFailed(true)} />;
  if (kind === "audio") return <audio src={file.url} controls autoPlay onError={() => setFailed(true)} />;
  if (kind === "text") return <TextPreview url={file.url} onFail={() => setFailed(true)} />;
  return <PdfPreview url={file.url} onFail={() => setFailed(true)} />;
}

function TextPreview({ url, onFail }: { url: string; onFail: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  useEffect(() => {
    let active = true;
    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        const body = await response.text();
        if (active) setText(body.slice(0, MAX_TEXT_CHARS));
      })
      .catch(() => active && failRef.current());
    return () => {
      active = false;
    };
  }, [url]);
  return text === null ? <p className="group-viewer-note">Opening…</p> : <pre>{text}</pre>;
}

function PdfPreview({ url, onFail }: { url: string; onFail: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Opening…");
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    let active = true;
    const target = holder.current;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      const [pdfjs, response] = await Promise.all([getClientPdfJs(), fetch(url)]);
      if (!response.ok) throw new Error("failed");
      const data = new Uint8Array(await response.arrayBuffer());
      if (!active || !target) return;
      const loading = pdfjs.getDocument({ data });
      task = loading;
      const pdf = await loading.promise;
      const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      // One page at a time, so the first is readable while the rest draw.
      for (let number = 1; number <= pages && active; number += 1) {
        const page = await pdf.getPage(number);
        const width = Math.min(target.clientWidth || 360, 900);
        const scale = width / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale: scale * ratio });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${width}px`;
        const context = canvas.getContext("2d");
        if (!context || !active) return;
        target.appendChild(canvas);
        await page.render({ canvasContext: context, viewport }).promise;
        setStatus(number < pages ? "" : pdf.numPages > pages ? `Showing the first ${pages} pages. Download the file to read the rest.` : "");
      }
    })().catch(() => active && failRef.current());
    return () => {
      active = false;
      void task?.destroy();
      target?.replaceChildren();
    };
  }, [url]);

  return (
    <div className="group-viewer-pdf">
      <div ref={holder} className="group-viewer-pages" />
      {status ? <p className="group-viewer-note">{status}</p> : null}
    </div>
  );
}
