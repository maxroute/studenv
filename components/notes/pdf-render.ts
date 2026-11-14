"use client";

import { getClientPdfJs } from "@/lib/utils/pdf";

// One loaded document per asset, shared by the preview card, the viewer and
// every pinned page, so a PDF is downloaded and parsed once per visit.
type PdfDocument = {
  numPages: number;
  getPage: (page: number) => Promise<PdfPage>;
};
type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void>; cancel: () => void };
};

const documents = new Map<string, Promise<PdfDocument>>();

export function loadPdf(assetId: string): Promise<PdfDocument> {
  let pending = documents.get(assetId);
  if (!pending) {
    pending = (async () => {
      const pdfjs = await getClientPdfJs();
      if (!pdfjs) throw new Error("PDFs can only be shown in the browser.");
      const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/content`);
      if (!response.ok) throw new Error(response.status === 404 ? "This PDF is no longer available." : "The PDF could not be loaded.");
      const data = new Uint8Array(await response.arrayBuffer());
      const task = pdfjs.getDocument({ data });
      return (await task.promise) as PdfDocument;
    })();
    documents.set(assetId, pending);
    // A failed load may succeed later (offline, server restart).
    pending.catch(() => documents.delete(assetId));
  }
  return pending;
}

/** Width / height of a page, for laying out before it renders. */
export async function pageAspect(assetId: string, page: number): Promise<number> {
  const pdf = await loadPdf(assetId);
  const viewport = (await pdf.getPage(clampPage(pdf, page))).getViewport({ scale: 1 });
  return viewport.width / viewport.height;
}

const clampPage = (pdf: PdfDocument, page: number) => Math.min(Math.max(1, Math.floor(page) || 1), pdf.numPages);

/**
 * Draws `page` into `canvas` at `cssWidth` CSS pixels (sharp on high-DPI
 * screens). Returns a cancel function; a cancelled render does nothing.
 */
export function renderPdfPage(assetId: string, page: number, canvas: HTMLCanvasElement, cssWidth: number, onDone?: (error: Error | null) => void) {
  let cancelled = false;
  let cancelRender: (() => void) | null = null;
  void (async () => {
    try {
      const pdf = await loadPdf(assetId);
      const pdfPage = await pdf.getPage(clampPage(pdf, page));
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: (cssWidth / base.width) * ratio });
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot draw the PDF.");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const task = pdfPage.render({ canvasContext: context, viewport });
      cancelRender = () => task.cancel();
      await task.promise;
      if (!cancelled) onDone?.(null);
    } catch (error) {
      if (cancelled) return;
      // pdf.js rejects a cancelled render; that is not a failure.
      if (error instanceof Error && error.name === "RenderingCancelledException") return;
      onDone?.(error instanceof Error ? error : new Error("The PDF could not be shown."));
    }
  })();
  return () => {
    cancelled = true;
    cancelRender?.();
  };
}
