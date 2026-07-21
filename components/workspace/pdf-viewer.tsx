"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalCache } from "@/hooks/use-local-cache";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { getClientPdfJs } from "@/lib/utils/pdf";

type HighlightRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PdfHighlight = {
  id: string;
  pageNumber: number;
  text: string;
  rects: HighlightRect[];
  createdAt: number;
};

type PendingSelection = {
  pageNumber: number;
  text: string;
  rects: HighlightRect[];
  bubbleX: number;
  bubbleY: number;
};

interface PdfPageProps {
  pdf: any;
  pageNumber: number;
  registerPageRef: (pageNumber: number, element: HTMLDivElement | null) => void;
  registerTextLayerRef: (pageNumber: number, element: HTMLDivElement | null) => void;
  onTextSelection: (selection: PendingSelection | null) => void;
  highlights: PdfHighlight[];
  scale?: number;
}

const EMPTY_HIGHLIGHTS: PdfHighlight[] = [];

const PdfPage = memo(function PdfPage({
  pdf,
  pageNumber,
  registerPageRef,
  registerTextLayerRef,
  onTextSelection,
  highlights,
  scale = 1.2,
}: PdfPageProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const attachRootRef = useCallback(
    (element: HTMLDivElement | null) => {
      rootRef.current = element;
      registerPageRef(pageNumber, element);
    },
    [pageNumber, registerPageRef],
  );

  const attachTextLayerRef = useCallback(
    (element: HTMLDivElement | null) => {
      textLayerRef.current = element;
      registerTextLayerRef(pageNumber, element);
    },
    [pageNumber, registerTextLayerRef],
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: "600px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    if (!pdf) return;

    pdf.getPage(pageNumber).then((page: any) => {
      if (!active) return;
      const viewport = page.getViewport({ scale });
      setDimensions({ width: viewport.width, height: viewport.height });
    });

    return () => {
      active = false;
    };
  }, [pdf, pageNumber, scale]);

  useEffect(() => {
    if (!pdf || dimensions.width === 0 || !canvasRef.current || !isVisible) return;
    let active = true;
    let renderTask: any = null;

    const renderCanvas = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (!active || !canvasRef.current) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;

        if (active) {
          setIsRendered(true);
        }
      } catch (error: any) {
        if (error?.name !== "RenderingCancelledException") {
          console.warn("Failed to render page", pageNumber, error);
        }
      }
    };

    void renderCanvas();

    return () => {
      active = false;
      renderTask?.cancel?.();
    };
  }, [dimensions.width, pdf, pageNumber, scale, isVisible]);

  useEffect(() => {
    if (!pdf || dimensions.width === 0 || !textLayerRef.current || !isVisible) return;
    let active = true;

    const renderTextLayer = async () => {
      try {
        const pdfjsLib = await getClientPdfJs();
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const textContent = await page.getTextContent();
        const container = textLayerRef.current;

        if (!active || !container) return;

        container.innerHTML = "";
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container,
          viewport,
        });
        await textLayer.render();
      } catch (error) {
        console.warn("Failed to render PDF text layer", pageNumber, error);
      }
    };

    void renderTextLayer();

    return () => {
      active = false;
      if (textLayerRef.current) {
        textLayerRef.current.innerHTML = "";
      }
    };
  }, [dimensions.width, pdf, pageNumber, scale, isVisible]);

  const handleSelection = useCallback(() => {
    requestAnimationFrame(() => {
      const root = rootRef.current;
      const textLayer = textLayerRef.current;
      const selection = window.getSelection();

      if (!root || !textLayer || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return;
      }

      const range = selection.getRangeAt(0);
      const ancestor = range.commonAncestorContainer;
      if (!textLayer.contains(ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentNode : ancestor)) {
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText) {
        return;
      }

      const pageRect = root.getBoundingClientRect();
      const textLayerRect = textLayer.getBoundingClientRect();
      const rangeRects = Array.from(range.getClientRects())
        .filter((rect) => rect.width > 1 && rect.height > 1)
        .map((rect) => ({
          x: ((rect.left - pageRect.left) / pageRect.width) * 100,
          y: ((rect.top - pageRect.top) / pageRect.height) * 100,
          width: (rect.width / pageRect.width) * 100,
          height: (rect.height / pageRect.height) * 100,
        }))
        .filter((rect) => rect.width > 0 && rect.height > 0);

      if (rangeRects.length === 0) {
        return;
      }

      const firstRect = range.getBoundingClientRect();
      onTextSelection({
        pageNumber,
        text: selectedText,
        rects: rangeRects,
        bubbleX: root.offsetLeft + (firstRect.left - textLayerRect.left) + firstRect.width / 2,
        bubbleY: root.offsetTop + (firstRect.top - textLayerRect.top) - 12,
      });

      textLayer.classList.remove("selecting");
    });
  }, [onTextSelection, pageNumber]);

  const handleMouseDown = useCallback(() => {
    textLayerRef.current?.classList.add("selecting");
  }, []);

  useEffect(() => {
    const handlePointerUp = () => {
      textLayerRef.current?.classList.remove("selecting");
    };

    window.addEventListener("mouseup", handlePointerUp);
    return () => {
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, []);

  return (
    <div
      ref={attachRootRef}
      data-page-number={pageNumber}
      className="pdf-page-container bg-white shadow-[0_4px_16px_rgba(15,23,42,0.1)] mb-6 mx-auto relative flex items-center justify-center transition-opacity"
      style={{
        ["--scale-factor" as any]: scale,
        ["--user-unit" as any]: 1,
        ["--total-scale-factor" as any]: scale,
        width: dimensions.width > 0 ? dimensions.width : "100%",
        height: dimensions.height > 0 ? dimensions.height : "800px",
        minHeight: "400px",
        maxWidth: "100%",
      }}
    >
      {!isRendered && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 bg-slate-50">
          <div className="animate-pulse flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Page {pageNumber}</span>
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="max-w-full"
        style={{
          width: dimensions.width > 0 ? `${dimensions.width}px` : "100%",
          height: dimensions.height > 0 ? `${dimensions.height}px` : "100%",
          opacity: isRendered ? 1 : 0,
          transition: "opacity 0.2s",
        }}
      />

      <div className="pdf-highlight-layer absolute inset-0 pointer-events-none">
        {highlights.flatMap((highlight) =>
          highlight.rects.map((rect, index) => (
            <div
              key={`${highlight.id}-${index}`}
              className="pdf-highlight-rect"
              style={{
                left: `${rect.x}%`,
                top: `${rect.y}%`,
                width: `${rect.width}%`,
                height: `${rect.height}%`,
              }}
              title={highlight.text}
            />
          )),
        )}
      </div>

      <div
        ref={attachTextLayerRef}
        className="textLayer pdf-text-layer absolute inset-0"
        onMouseDown={handleMouseDown}
        onMouseUp={handleSelection}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.pdf === nextProps.pdf &&
    prevProps.pageNumber === nextProps.pageNumber &&
    prevProps.scale === nextProps.scale &&
    prevProps.highlights === nextProps.highlights &&
    prevProps.registerPageRef === nextProps.registerPageRef &&
    prevProps.registerTextLayerRef === nextProps.registerTextLayerRef &&
    prevProps.onTextSelection === nextProps.onTextSelection
  );
});

interface CustomPdfViewerProps {
  contentUrl: string;
  assetId?: string;
  documentTitle?: string;
  onPageChange: (page: number) => void;
  onTotalPages: (total: number) => void;
  scrollToPage?: { page: number; token: number };
}

export function CustomPdfViewer({
  contentUrl,
  assetId,
  documentTitle,
  onPageChange,
  onTotalPages,
  scrollToPage,
}: CustomPdfViewerProps) {
  const { getCachedMedia } = useLocalCache();
  const [pdf, setPdf] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<PdfHighlight[]>([]);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const frameRef = useRef<number | null>(null);
  const lastReportedPage = useRef<number>(1);
  const onPageChangeRef = useRef(onPageChange);
  const onTotalPagesRef = useRef(onTotalPages);
  const { addItem, viewport, items } = useWorkspaceStore();

  const storageKey = useMemo(
    () => `pdf-highlights:${assetId ?? contentUrl}`,
    [assetId, contentUrl],
  );

  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  useEffect(() => {
    onTotalPagesRef.current = onTotalPages;
  }, [onTotalPages]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = window.localStorage.getItem(storageKey);
      setHighlights(saved ? (JSON.parse(saved) as PdfHighlight[]) : []);
    } catch (error) {
      console.warn("Failed to load saved PDF highlights", error);
      setHighlights([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(highlights));
    } catch (error) {
      console.warn("Failed to persist PDF highlights", error);
    }
  }, [highlights, storageKey]);

  const registerPageRef = useCallback((pageNumber: number, element: HTMLDivElement | null) => {
    if (element) {
      pageRefs.current.set(pageNumber, element);
    } else {
      pageRefs.current.delete(pageNumber);
    }
  }, []);

  const registerTextLayerRef = useCallback((pageNumber: number, element: HTMLDivElement | null) => {
    if (element) {
      textLayerRefs.current.set(pageNumber, element);
    } else {
      textLayerRefs.current.delete(pageNumber);
    }
  }, []);

  const updateCurrentPageFromScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || pageRefs.current.size === 0) return;

    const containerTop = container.getBoundingClientRect().top;
    const containerHeight = container.clientHeight;
    let bestPage = lastReportedPage.current;
    let bestVisible = -1;

    for (const [pageNumber, element] of pageRefs.current.entries()) {
      const rect = element.getBoundingClientRect();
      const elTop = rect.top - containerTop;
      const elBottom = rect.bottom - containerTop;
      const visTop = Math.max(elTop, 0);
      const visBottom = Math.min(elBottom, containerHeight);
      const visible = Math.max(0, visBottom - visTop);

      if (visible > bestVisible) {
        bestVisible = visible;
        bestPage = pageNumber;
      }
    }

    if (bestPage !== lastReportedPage.current) {
      lastReportedPage.current = bestPage;
      onPageChangeRef.current(bestPage);
    }
  }, []);

  const scheduleScrollSync = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      updateCurrentPageFromScroll();
    });
  }, [updateCurrentPageFromScroll]);

  useEffect(() => {
    let active = true;

    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        setPendingSelection(null);

        const pdfjsLib = await getClientPdfJs();
        let data: ArrayBuffer;

        if (assetId) {
          const cacheKey = `pdf-${assetId}`;
          const blob = await getCachedMedia(cacheKey, async () => {
            const resp = await fetch(contentUrl);
            if (!resp.ok) throw new Error("Failed to fetch PDF");
            return { blob: await resp.blob(), mimeType: "application/pdf" };
          });
          data = await blob.arrayBuffer();
        } else {
          const resp = await fetch(contentUrl);
          if (!resp.ok) throw new Error("Failed to fetch PDF");
          data = await resp.arrayBuffer();
        }

        if (!active) return;

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) } as any);
        const pdfDoc = await loadingTask.promise;

        if (!active) return;

        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        onTotalPagesRef.current(pdfDoc.numPages);
        setLoading(false);

        requestAnimationFrame(() => {
          if (active) {
            updateCurrentPageFromScroll();
          }
        });
      } catch (err: any) {
        console.error("PDF Load Error:", err);
        if (active) {
          setError(err.message || "Failed to load PDF");
          setLoading(false);
        }
      }
    };

    void loadPdf();

    return () => {
      active = false;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [assetId, contentUrl, getCachedMedia, updateCurrentPageFromScroll]);

  useEffect(() => {
    if (!scrollToPage?.page || !containerRef.current) return;
    const targetPage = pageRefs.current.get(scrollToPage.page);
    if (targetPage) {
      containerRef.current.scrollTo({
        top: targetPage.offsetTop - 20,
        behavior: "smooth",
      });
    }
  }, [scrollToPage]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setPendingSelection(null);
        return;
      }

      const target = event.target as Node | null;
      if (!target) return;

      const insideTextLayer = Array.from(textLayerRefs.current.values()).some((layer) => layer.contains(target));
      const insideAction = (target as HTMLElement).closest?.("[data-pdf-selection-actions]");
      if (!insideTextLayer && !insideAction) {
        setPendingSelection(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const handleTextSelection = useCallback((selection: PendingSelection | null) => {
    setPendingSelection(selection);
  }, []);

  const addHighlight = useCallback(() => {
    if (!pendingSelection) return;

    const nextHighlight: PdfHighlight = {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `hl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pageNumber: pendingSelection.pageNumber,
      text: pendingSelection.text,
      rects: pendingSelection.rects,
      createdAt: Date.now(),
    };

    setHighlights((current) => [...current, nextHighlight]);
    window.getSelection()?.removeAllRanges();
    setPendingSelection(null);
  }, [pendingSelection]);

  const addWorkspaceNote = useCallback(() => {
    if (!pendingSelection) return;

    const pageLabel = `Page ${pendingSelection.pageNumber}`;
    const title = documentTitle?.trim() || "PDF Highlight";
    const noteText = `${title} - ${pageLabel}\n\n"${pendingSelection.text}"`;
    const noteCount = items.filter((item) => item.type === "sticky").length;

    addItem(
      "sticky",
      {
        text: noteText,
        w: 260,
        h: 220,
      },
      {
        x: -viewport.x / viewport.zoom + 640,
        y: -viewport.y / viewport.zoom + 80 + noteCount * 28,
      },
    );

    addHighlight();
  }, [addHighlight, addItem, documentTitle, items, pendingSelection, viewport]);

  const clearPageHighlights = useCallback(() => {
    if (!pendingSelection) return;

    setHighlights((current) =>
      current.filter((highlight) => highlight.pageNumber !== pendingSelection.pageNumber),
    );
    window.getSelection()?.removeAllRanges();
    setPendingSelection(null);
  }, [pendingSelection]);

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, PdfHighlight[]>();
    for (const highlight of highlights) {
      const current = map.get(highlight.pageNumber);
      if (current) {
        current.push(highlight);
      } else {
        map.set(highlight.pageNumber, [highlight]);
      }
    }
    return map;
  }, [highlights]);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-200">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4" />
        <p className="text-slate-500 text-sm font-medium">Loading Document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-200 text-slate-500">
        <AlertCircle className="w-8 h-8 text-slate-400 mb-2" />
        <p className="font-medium text-sm text-slate-700">Failed to load PDF</p>
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <div
      ref={containerRef}
      onScroll={scheduleScrollSync}
      className="w-full h-full overflow-y-auto bg-slate-200 p-4 pb-20 relative pdf-scroll-container"
      style={{ scrollBehavior: "smooth" }}
    >
      <div className="max-w-5xl mx-auto flex flex-col items-center relative">
        {pages.map((page) => (
          <PdfPage
            key={page}
            pdf={pdf}
            pageNumber={page}
            registerPageRef={registerPageRef}
            registerTextLayerRef={registerTextLayerRef}
            onTextSelection={handleTextSelection}
            highlights={highlightsByPage.get(page) ?? EMPTY_HIGHLIGHTS}
            scale={1.5}
          />
        ))}

        {pendingSelection ? (
          <div
            data-pdf-selection-actions
            className="pdf-selection-actions"
            style={{
              left: pendingSelection.bubbleX,
              top: Math.max(12, pendingSelection.bubbleY),
            }}
          >
            <button onClick={addHighlight} className="pdf-selection-button">
              Highlight
            </button>
            <button onClick={addWorkspaceNote} className="pdf-selection-button pdf-selection-button-accent">
              Note
            </button>
            <button onClick={clearPageHighlights} className="pdf-selection-button">
              Clear Page
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AlertCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}
