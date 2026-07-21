"use client";

import { PdfFragmentNode, StudioItem, getWorkspaceNodeText } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { Save, AlertCircle, GripHorizontal, FileText } from "lucide-react";
import { useLocalCache } from "@/hooks/use-local-cache";
import { getClientPdfJs } from "@/lib/utils/pdf";

interface PdfFragmentProps {
  item: PdfFragmentNode;
}

export function PdfFragment({ item }: PdfFragmentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  const { getCachedMedia } = useLocalCache();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetTitle, setAssetTitle] = useState("PDF");
  const [isVisible, setIsVisible] = useState(false);
  const previewSrc = item.props.previewSrc;
  const fallbackPdfSrc = `/api/assets/${item.props.assetId}/content#toolbar=0&navpanes=0&scrollbar=0&page=${item.props.pageNumber}`;

  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;

    const loadAssetDetails = async () => {
      if (!item.props.assetId) return;

      try {
        const response = await fetch(`/api/assets/${item.props.assetId}`);
        if (!response.ok) return;
        const asset = await response.json();
        if (active) {
          setAssetTitle(asset.title || "PDF");
        }
      } catch (error) {
        console.warn("Failed to load PDF metadata", error);
      }
    };

    void loadAssetDetails();
    return () => {
      active = false;
    };
  }, [item.props.assetId]);

  useEffect(() => {
    if (previewSrc) {
      setLoading(false);
      setError(null);
      return;
    }

    if (!isVisible) {
      return;
    }

    let active = true;
    const renderPage = async () => {
      const { assetId, pageNumber } = item.props;
      if (!assetId) return;
      
      try {
        setError(null);
        setLoading(true);
        const pdfjsLib = await getClientPdfJs();
        const cacheKey = `pdf-${assetId}`;
        const blob = await getCachedMedia(cacheKey, async () => {
          const resp = await fetch(`/api/assets/${assetId}/content`);
          if (!resp.ok) throw new Error("Failed to fetch PDF");
          return {
            blob: await resp.blob(),
            mimeType: "application/pdf"
          };
        });

        const data = await blob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(data),
        } as any);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageNumber || 1);
        
        if (!active || !canvasRef.current) return;

        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };
          await page.render(renderContext as any).promise;
        }
        setLoading(false);
      } catch (e: any) {
        console.warn("PDF fragment render error", e);
        setError(e.message || "Failed to render PDF");
        setLoading(false);
      }
    };

    renderPage();
    return () => { active = false; };
  }, [getCachedMedia, item.props.assetId, item.props.pageNumber, previewSrc, isVisible]);

  const { items } = useWorkspaceStore();
  const { id: workspaceId } = useParams();
  const [saving, setSaving] = useState(false);

  const handleSaveToSource = useCallback(async () => {
    if (saving) return;
    setSaving(true);

    try {
      if (!item.props.revisionId) {
        toast.error("No saved revision found for this PDF.");
        return;
      }

      // Find overlapping items (heuristic overlap check)
      const myBounds = { x1: item.x, y1: item.y, x2: item.x + item.w, y2: item.y + item.h };
      
      const annotations = items
        .filter((it: StudioItem) => it.id !== item.id)
        .filter((it: StudioItem) => {
            const itBounds = { x1: it.x, y1: it.y, x2: it.x + it.w, y2: it.y + it.h };
            return !(itBounds.x2 < myBounds.x1 || itBounds.x1 > myBounds.x2 || itBounds.y2 < myBounds.y1 || itBounds.y1 > myBounds.y2);
        })
        .map((it: StudioItem) => ({
            type: it.type,
            x: ((it.x - item.x) / item.w) * 100,
            y: ((it.y - item.y) / item.h) * 100,
            width: (it.w / item.w) * 100,
            height: (it.h / item.h) * 100,
            text: getWorkspaceNodeText(it),
            pageNumber: item.props.pageNumber,
        }));

      const response = await fetch(`/api/workspace/${workspaceId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAssetId: item.props.assetId,
          sourceRevisionId: item.props.revisionId,
          annotations,
        }),
      });

      if (!response.ok) throw new Error("Export failed");
      toast.success("Save job queued!");
    } catch (e: any) {
      toast.error(e.message || "Failed to trigger save-back.");
    } finally {
      setSaving(false);
    }
  }, [items, item, workspaceId, saving]);

  return (
    <div ref={observerRef} className="w-full h-full flex flex-col bg-white">
      <div className="drag-handle shrink-0 cursor-move border-b bg-slate-50 px-2 py-1.5 select-none">
        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 font-medium">
          <div className="flex min-w-0 items-center gap-1.5">
            <GripHorizontal size={12} className="shrink-0 text-slate-400" />
            <FileText size={12} className="shrink-0 text-red-500" />
            <span className="truncate max-w-[10rem]" title={assetTitle}>{assetTitle}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span>Page {item.props.pageNumber}</span>
            <span className="uppercase tracking-widest opacity-50">Page Stamp</span>
          </div>
        </div>
      </div>
      <div className="flex-1 relative bg-slate-100 flex items-center justify-center overflow-auto min-h-0">
        {loading && (
          <div className="absolute inset-0 flex flex-col justify-between p-4 bg-slate-50 animate-pulse z-10">
            <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
            <div className="space-y-3 flex-1 justify-center flex flex-col">
              <div className="h-3 bg-slate-200 rounded w-5/6"></div>
              <div className="h-3 bg-slate-200 rounded w-full"></div>
              <div className="h-3 bg-slate-200 rounded w-4/6"></div>
              <div className="h-3 bg-slate-200 rounded w-5/6"></div>
              <div className="h-3 bg-slate-200 rounded w-3/6"></div>
            </div>
            <div className="h-3 bg-slate-200 rounded w-1/4 mt-4"></div>
          </div>
        )}
        {error && !loading ? (
          <iframe
            src={fallbackPdfSrc}
            title={`${assetTitle} page ${item.props.pageNumber}`}
            className="h-full w-full border-none bg-white"
          />
        ) : previewSrc ? (
          <img
            src={previewSrc}
            alt={`${assetTitle} page ${item.props.pageNumber}`}
            className="max-w-full shadow-md"
            draggable={false}
          />
        ) : (
          <canvas 
            ref={canvasRef} 
            className="max-w-full shadow-md"
            style={{ display: loading ? "none" : "block" }} 
          />
        )}
      </div>
      <div className="px-2 py-1 bg-white border-t flex items-center justify-between text-[10px] text-slate-500 font-medium group/footer select-none">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate max-w-[12rem] opacity-70" title={assetTitle}>{assetTitle}</span>
        </div>
        <button 
          onClick={handleSaveToSource}
          disabled={saving || !item.props.revisionId}
          className="p-1 hover:bg-slate-100 rounded text-indigo-600 flex items-center gap-1 transition-colors"
        >
          {saving ? (
            <div className="animate-spin h-3 w-3 border-b-2 border-current rounded-full" />
          ) : (
            <Save size={12} />
          )}
          <span>Save to Source</span>
        </button>
      </div>
    </div>
  );
}
