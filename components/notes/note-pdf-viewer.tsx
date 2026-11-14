"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pin, X } from "lucide-react";
import { loadPdf, renderPdfPage } from "./pdf-render";

type Props = {
  assetId: string;
  title: string;
  /** Pins a page into the note; the viewer stays open so more pages can be pinned. */
  onPin?: (page: number) => void;
  onClose: () => void;
  initialPage?: number;
};

/** The note's full-screen PDF reader: scroll the pages, pin any of them into the note. */
export function NotePdfViewer({ assetId, title, onPin, onClose, initialPage = 1 }: Props) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [aspect, setAspect] = useState(0.77);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(initialPage);
  const [width, setWidth] = useState(0);
  const [pinned, setPinned] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    loadPdf(assetId)
      .then(async (pdf) => {
        const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
        if (!active) return;
        setAspect(first.width / first.height);
        setPageCount(pdf.numPages);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "The PDF could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [assetId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setWidth(Math.min(element.clientWidth - 24, 900));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // The current page is the one under the middle of the reader.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !pageCount) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = element.getBoundingClientRect();
      const middle = box.top + box.height / 2;
      for (const page of element.querySelectorAll<HTMLElement>("[data-viewer-page]")) {
        const rect = page.getBoundingClientRect();
        if (rect.top <= middle && rect.bottom + 16 >= middle) {
          setCurrent(Number(page.dataset.viewerPage) || 1);
          return;
        }
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [pageCount, width]);

  // Open on the requested page once the pages are laid out.
  useEffect(() => {
    if (!pageCount || initialPage <= 1) return;
    scrollRef.current?.querySelector(`[data-viewer-page="${initialPage}"]`)?.scrollIntoView({ block: "start" });
  }, [initialPage, pageCount]);

  const pin = (page: number) => {
    onPin?.(page);
    setPinned(page);
    window.setTimeout(() => setPinned((value) => (value === page ? null : value)), 1600);
  };

  return createPortal(
    <div className="note-pdf-viewer" role="dialog" aria-modal="true" aria-label={title}>
      <header className="note-pdf-viewer-bar">
        <span className="note-pdf-viewer-title">{title}</span>
        <span className="note-pdf-viewer-count">{pageCount ? `${current} / ${pageCount}` : ""}</span>
        {onPin ? (
          <button type="button" className="note-pdf-viewer-pin" disabled={!pageCount} onClick={() => pin(current)}>
            <Pin size={15} /> {pinned === current ? "Pinned" : `Pin page ${current}`}
          </button>
        ) : null}
        <button type="button" className="note-pdf-viewer-close" onClick={onClose} aria-label="Close PDF">
          <X size={18} />
        </button>
      </header>
      <div className="note-pdf-viewer-pages" ref={scrollRef}>
        {error ? <p className="note-pdf-viewer-message">{error}</p> : null}
        {!error && !pageCount ? (
          <p className="note-pdf-viewer-message"><Loader2 size={16} className="note-spin" /> Loading PDF…</p>
        ) : null}
        {pageCount && width > 0
          ? Array.from({ length: pageCount }, (_, index) => (
              <ViewerPage
                key={index + 1}
                assetId={assetId}
                page={index + 1}
                width={width}
                aspect={aspect}
                root={scrollRef}
                onPin={onPin ? pin : undefined}
                pinned={pinned === index + 1}
              />
            ))
          : null}
      </div>
    </div>,
    document.body,
  );
}

function ViewerPage({
  assetId, page, width, aspect, root, onPin, pinned,
}: {
  assetId: string;
  page: number;
  width: number;
  aspect: number;
  root: React.RefObject<HTMLDivElement>;
  onPin?: (page: number) => void;
  pinned: boolean;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      // Render a little ahead of the scroll so pages are ready when reached.
      { root: root.current, rootMargin: "600px 0px" },
    );
    observer.observe(holder);
    return () => observer.disconnect();
  }, [page, root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!near || !canvas) return;
    return renderPdfPage(assetId, page, canvas, width, (error) => setFailed(Boolean(error)));
  }, [assetId, near, page, width]);

  return (
    <div className="note-pdf-viewer-page" data-viewer-page={page} ref={holderRef} style={{ width, aspectRatio: String(aspect) }}>
      <canvas ref={canvasRef} aria-label={`Page ${page}`} />
      {failed ? <span className="note-pdf-viewer-message">Page {page} could not be shown.</span> : null}
      <span className="note-pdf-viewer-pagenum">{page}</span>
      {onPin ? (
        <button type="button" className="note-pdf-viewer-pagepin" onClick={() => onPin(page)} aria-label={`Pin page ${page} into the open page`}>
          <Pin size={14} /> {pinned ? "Pinned" : "Pin"}
        </button>
      ) : null}
    </div>
  );
}
