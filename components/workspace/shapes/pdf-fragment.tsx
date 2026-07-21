"use client";

import { 
  BaseBoxShapeUtil, 
  HTMLContainer, 
  TLBaseShape, 
  useEditor
} from "@tldraw/tldraw";
import type { RecordProps } from "@tldraw/tlschema";
import { T } from "@tldraw/validate";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { Save } from "lucide-react";
import { useLocalCache } from "@/hooks/use-local-cache";
import { getClientPdfJs } from "@/lib/utils/pdf";

export type PdfFragmentShape = TLBaseShape<
  "pdf-fragment",
  {
    assetId: string;
    revisionId?: string;
    pageNumber: number;
    w: number;
    h: number;
    crop: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    annotationsJson?: string;
  }
>;

export class PdfFragmentShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = "pdf-fragment" as const;
  static override props: RecordProps<PdfFragmentShape> = {
    assetId: T.string,
    revisionId: T.string.optional(),
    pageNumber: T.number,
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    crop: T.object({
      x: T.number,
      y: T.number,
      width: T.number,
      height: T.number,
    }),
    annotationsJson: T.string.optional(),
  };

  override getDefaultProps(): PdfFragmentShape["props"] {
    return {
      assetId: "",
      revisionId: "",
      pageNumber: 1,
      w: 300,
      h: 400,
      crop: { x: 0, y: 0, width: 100, height: 100 },
      annotationsJson: "[]",
    };
  }

  override hideRotateHandle() {
    return false;
  }

  override component(shape: PdfFragmentShape) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const observerRef = useRef<HTMLDivElement>(null);
    const { getCachedMedia } = useLocalCache();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);

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
      if (!isVisible) return;
      let active = true;
      const renderPage = async () => {
        if (!shape.props.assetId) return;
        
        try {
          setError(null);
          setLoading(true);
          const pdfjsLib = await getClientPdfJs();
          const cacheKey = `pdf-${shape.props.assetId}`;
          const blob = await getCachedMedia(cacheKey, async () => {
            const resp = await fetch(`/api/assets/${shape.props.assetId}/content`);
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
          const page = await pdf.getPage(shape.props.pageNumber);
          
          if (!active || !canvasRef.current) return;

          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = canvasRef.current;
          const context = canvas.getContext("2d");
          
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
              canvas,
              canvasContext: context,
              viewport: viewport,
            };
            await page.render(renderContext as any).promise;
          }
          setLoading(false);
        } catch (e) {
          console.warn("PDF fragment render warning", e);
          setError(e instanceof Error ? e.message : "Failed to render PDF");
          setLoading(false);
        }
      };

      renderPage();
      return () => { active = false; };
    }, [shape.props.assetId, shape.props.pageNumber, getCachedMedia, isVisible]);

    const editor = useEditor();
    const { id: workspaceId } = useParams();
    const [saving, setSaving] = useState(false);

    const handleSaveToSource = useCallback(async () => {
      if (saving) return;
      setSaving(true);

      try {
        if (!shape.props.revisionId) {
          toast.error("This PDF has no saved revision yet, so save-back is unavailable.");
          return;
        }

        // 1. Find overlapping shapes
        const allShapes = editor.getCurrentPageShapes();
        const myBounds = editor.getShapePageBounds(shape.id)!;
        
        const annotations = allShapes
          .filter(s => s.id !== shape.id && editor.getShapePageBounds(s.id)?.collides(myBounds))
          .map(s => {
            const bounds = editor.getShapePageBounds(s.id)!;
            // Normalize coordinates to 0-100 relative to fragment
            return {
              type: s.type,
              x: ((bounds.minX - myBounds.minX) / myBounds.width) * 100,
              y: ((bounds.minY - myBounds.minY) / myBounds.height) * 100,
              width: (bounds.width / myBounds.width) * 100,
              height: (bounds.height / myBounds.height) * 100,
              text: (s.props as any).text || "",
              pageNumber: shape.props.pageNumber,
            };
          });

        // 2. Trigger Export Job
        const response = await fetch(`/api/workspace/${workspaceId}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceAssetId: shape.props.assetId,
            sourceRevisionId: shape.props.revisionId,
            annotations,
          }),
        });

        if (!response.ok) throw new Error("Export failed");
        
        toast.success("Save job queued! A new version will be created shortly.");
      } catch (e) {
        console.warn("PDF save-back warning", e);
        toast.error("Failed to trigger save-back.");
      } finally {
        setSaving(false);
      }
    }, [editor, shape, workspaceId, saving]);

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          width: shape.props.w,
          height: shape.props.h,
          backgroundColor: "#fff",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          border: "1px solid #e2e8f0",
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        <div ref={observerRef} className="w-full h-full flex flex-col overflow-hidden">
          <div className="flex-1 relative bg-slate-100 flex items-center justify-center overflow-auto">
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
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-slate-600 bg-white">
                {error}
              </div>
            ) : null}
            <canvas 
              ref={canvasRef} 
              className="max-w-full shadow-md"
              style={{ display: loading || Boolean(error) ? "none" : "block" }} 
            />
          </div>
        <div className="px-2 py-1 bg-white border-t flex items-center justify-between text-[10px] text-slate-500 font-medium group">
          <div className="flex items-center gap-2">
            <span>Page {shape.props.pageNumber}</span>
            <span className="uppercase tracking-widest opacity-50">Fragment</span>
          </div>
          <button 
            onClick={handleSaveToSource}
            disabled={saving || !shape.props.revisionId}
            className="p-1 hover:bg-slate-100 rounded text-indigo-600 flex items-center gap-1 transition-colors"
            title="Save annotations back to original PDF as a new version"
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
      </HTMLContainer>
    );
  }

  override indicator(shape: PdfFragmentShape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}
