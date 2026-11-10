"use client";

import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useViewerStore } from "@/hooks/use-viewer-store";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hand,
  ImagePlus,
  StickyNote,
  Lock,
  Maximize2,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Type,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { StudioItem, createWorkspaceItem } from "@/types/workspace";
import { StudioItemComponent } from "./items/studio-item";
import { PdfFragment } from "./items/PdfFragment";
import { VideoAnchor } from "./items/VideoAnchor";
import { TextNode } from "./items/TextNode";
import { FreeTextNode } from "./items/FreeTextNode";
import { StickyNode, STICKY_NOTE_COLORS } from "./items/StickyNode";
import { AssetDrawer } from "./AssetDrawer";
import { DrawingNode } from "./items/DrawingNode";
import { createStrokeOutline, getStrokeBounds, outlineToPath, strokeIntersectsPolyline } from "@/lib/workspace/drawing-geometry";
import { DrawingToolbar, DrawTool } from "./DrawingToolbar";
import { TextToolbar } from "./TextToolbar";
import {
  WORKSPACE_UPLOAD_ACCEPT,
  getAssetKindLabel,
  getViewerTypeForAssetKind,
  inferUploadAssetKind,
} from "@/lib/utils/media-assets";
import { ImageNode } from "./items/ImageNode";
import { ShapeNode } from "./items/ShapeNode";
import { ShapeCreationOverlay, type ShapePointerHandlers } from "./shapes/ShapeCreationOverlay";
import { ShapeToolButton, ShapeToolIcon } from "./shapes/ShapeToolButton";
import type { ShapeKind } from "@/lib/workspace/shape-types";
import { SHAPE_KINDS } from "@/lib/workspace/shape-types";
import { useSelectionStore, isIntersecting } from "@/lib/workspace/selection-engine";
import { isMigratedToSelectionOverlay } from "@/lib/workspace/shape-engine";
import { SelectionOverlay } from "./shapes/SelectionOverlay";
import { ShapeStyleToolbar } from "./shapes/ShapeStyleToolbar";
import { ShapeContextMenu } from "./shapes/ShapeContextMenu";
import { SnapGuidesOverlay } from "./shapes/SnapGuidesOverlay";
import { computeSnap, type SnapGuideLine } from "@/lib/workspace/snapping-engine";
import { useKeyboardShortcuts } from "@/lib/workspace/keyboard-shortcuts";
import {
  beginPointerSession,
  clearPointerSession,
  endPointerSession,
  ownsPointerSession,
  type PointerSession,
} from "@/lib/workspace/pointer-session";

import { uploadWorkspaceAsset } from "@/lib/utils/multipart-upload";


type CanvasPoint = { x: number; y: number; pressure?: number };
type HistoryEntry = StudioItem[];

function ZoomControls({ utils }: { utils: any }) {
  const [scale, setScale] = useState(1);
  const zoomAnimationTime = 140;

  useEffect(() => {
    if (!utils.instance) return;
    const interval = window.setInterval(() => {
      setScale(utils.instance.transformState.scale);
    }, 100);
    return () => window.clearInterval(interval);
  }, [utils.instance]);

  const handleStepZoom = (direction: 1 | -1) => {
    const instance = utils.instance;
    if (!instance) return;

    const currentScale = instance.transformState.scale ?? 1;
    const currentPercent = Math.round(currentScale * 100);
    const nextPercent = Math.max(10, Math.min(500, currentPercent + direction * 10));

    utils.setTransform(
      instance.transformState.positionX,
      instance.transformState.positionY,
      nextPercent / 100,
      zoomAnimationTime,
      "easeOut",
    );
  };

  return (
    <div className="fixed bottom-4 left-4 z-[1200] flex items-center bg-white shadow-lg border rounded-lg overflow-hidden select-none">
      <button
        onClick={() => handleStepZoom(-1)}
        className="p-1.5 hover:bg-slate-50 transition-colors border-r"
        title="Zoom Out"
      >
        <Minus size={14} className="text-slate-600" />
      </button>
      <div
        className="px-2 py-1 font-mono text-[10px] min-w-12 text-center text-slate-600 font-medium cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => utils.resetTransform()}
        title="Reset Zoom"
      >
        {Math.round(scale * 100)}%
      </div>
      <button
        onClick={() => handleStepZoom(1)}
        className="p-1.5 hover:bg-slate-50 transition-colors border-l"
        title="Zoom In"
      >
        <Plus size={14} className="text-slate-600" />
      </button>
      <button
        onClick={() => utils.resetTransform(zoomAnimationTime, "easeOut")}
        className="p-1.5 hover:bg-slate-50 transition-colors border-l"
        title="Fit to Screen"
      >
        <Maximize2 size={14} className="text-slate-600" />
      </button>
    </div>
  );
}

function buildStrokePath(points: CanvasPoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return `M ${points[0].x} ${points[0].y} ${points.slice(1).map((point) => `L ${point.x} ${point.y}`).join(" ")}`;
}

function resamplePolyline(points: CanvasPoint[], maxStep = 2): CanvasPoint[] {
  if (points.length <= 1) return points;

  const sampled: CanvasPoint[] = [points[0]];

  for (let i = 1; i < points.length; i += 1) {
    const start = points[i - 1];
    const end = points[i];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);

    if (distance === 0) {
      continue;
    }

    const segments = Math.max(1, Math.ceil(distance / maxStep));
    for (let step = 1; step <= segments; step += 1) {
      const t = step / segments;
      sampled.push({
        x: start.x + dx * t,
        y: start.y + dy * t,
      });
    }
  }

  return sampled;
}

function createDrawingFromWorldPoints(points: CanvasPoint[], color: string, strokeWidth: number) {
  const normalizedPoints = resamplePolyline(points, Math.max(1.5, strokeWidth / 2));
  const outline = createStrokeOutline(normalizedPoints, strokeWidth);
  const bounds = getStrokeBounds(outline);
  const padding = 2;
  const x = bounds.minX - padding;
  const y = bounds.minY - padding;
  const localPoints = normalizedPoints.map((point) => ({
    x: point.x - x,
    y: point.y - y,
    ...(point.pressure === undefined ? {} : { pressure: point.pressure }),
  }));
  const localOutline = outline.map((point) => ({ x: point.x - x, y: point.y - y }));
  return {
    x, y,
    w: Math.max(bounds.maxX - bounds.minX + padding * 2, 1),
    h: Math.max(bounds.maxY - bounds.minY + padding * 2, 1),
    d: outlineToPath(localOutline),
    points: localPoints,
    color,
    strokeWidth,
    outline: true,
  };
}

function cloneItemsSnapshot(items: StudioItem[]): HistoryEntry {
  return items.map((item) => ({
    ...item,
    props: { ...item.props },
  })) as HistoryEntry;
}

function clampScale(scale: number) {
  return Math.max(0.1, Math.min(5, scale));
}

type WorkspaceTool =
  | "select"
  | "pan"
  | "pen"
  | "highlighter"
  | "eraser"
  | "text"
  | "sticky"
  | ShapeKind;

interface StudioCanvasProps {
  workspaceId: string;
}

export function TldrawCanvas({ workspaceId: _workspaceId }: StudioCanvasProps) {
  const { workspaceId, items, viewport, workspaceAssetIds, isLoading, addItem, updateItem, updateItems, updateViewport, syncWithServer, registerWorkspaceAsset } =
    useWorkspaceStore();

  // Unified Workspace Tool State Machine (Active Tool is Single Source of Truth)
  const [activeTool, setActiveTool] = useState<WorkspaceTool>("select");
  const [isTextToolLocked, setIsTextToolLocked] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>("pen");
  const [activeShapeKind, setActiveShapeKind] = useState<ShapeKind>("rectangle");
  const [mobileToolbarOpen, setMobileToolbarOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);


  // Derived state booleans to maintain backward compatibility
  const isPanning = activeTool === "pan";
  const [isPanDragging, setIsPanDragging] = useState(false);


  useEffect(() => {
    if (!isPanDragging) return;
    const finishPanGesture = () => setIsPanDragging(false);
    window.addEventListener("pointerup", finishPanGesture);
    window.addEventListener("pointercancel", finishPanGesture);
    return () => {
      window.removeEventListener("pointerup", finishPanGesture);
      window.removeEventListener("pointercancel", finishPanGesture);
    };
  }, [isPanDragging]);

  const isDrawing = activeTool === "pen" || activeTool === "highlighter" || activeTool === "eraser";
  const isTextToolActive = activeTool === "text";
  const isStickyToolActive = activeTool === "sticky";
  const isShapeToolActive = SHAPE_KINDS.includes(activeTool as any);

  // Mock setter wrappers using functional updaters.
  // When disabling (val=false), only reset to "select" if the current tool
  // matches — prevents later false-setters from overriding an earlier
  // true-setter in the same React batch.
  const setIsPanning = useCallback((val: boolean) => {
    if (val) {
      setActiveTool("pan");
    } else {
      setActiveTool((prev) => (prev === "pan" ? "select" : prev));
    }
  }, []);

  const setIsDrawing = useCallback((val: boolean) => {
    if (val) {
      setActiveTool(drawTool);
    } else {
      setActiveTool((prev) =>
        prev === "pen" || prev === "highlighter" || prev === "eraser"
          ? "select"
          : prev
      );
    }
  }, [drawTool]);

  const setIsTextToolActive = useCallback((val: boolean) => {
    if (val) {
      setActiveTool("text");
    } else {
      setActiveTool((prev) => (prev === "text" ? "select" : prev));
    }
  }, []);

  const setIsShapeToolActive = useCallback((val: boolean) => {
    if (val) {
      setActiveTool(activeShapeKind);
    } else {
      setActiveTool((prev) =>
        SHAPE_KINDS.includes(prev as any) ? "select" : prev
      );
    }
  }, [activeShapeKind]);

  const activateTextTool = useCallback((lock = false) => {
    setActiveTool("text");
    setIsTextToolLocked(lock);
    setSelectedFreeTextId(null);
    setEditingFreeTextId(null);
    setSelectedDrawingId(null);
    setCurrentPath([]);
    setEraserPath([]);
  }, []);

  const [selectedFreeTextId, setSelectedFreeTextId] = useState<string | null>(null);
  const [editingFreeTextId, setEditingFreeTextId] = useState<string | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedStickyId, setSelectedStickyId] = useState<string | null>(null);
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [stickyColor, setStickyColor] = useState<string>(STICKY_NOTE_COLORS[0].value);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPanning) return;
    setHoveredItemId(null);
    setIsPanDragging(false);
  }, [isPanning]);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [selectionScreenBox, setSelectionScreenBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const shapePointerHandlersRef = useRef<ShapePointerHandlers | null>(null);
  const canvasGestureRef = useRef<{
    pointerId: number;
    mode: "pan" | "select" | "dismiss-text" | "draw" | "text" | "shape" | "sticky";
    startClientX: number;
    startClientY: number;
    startWorldX: number;
    startWorldY: number;
    startTransformX: number;
    startTransformY: number;
    scale: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuideLine[]>([]);

  const { selectedIds } = useSelectionStore();

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const itemEl = target.closest("[data-shape-id]");

    if (itemEl) {
      e.preventDefault();
      const itemId = itemEl.getAttribute("data-shape-id")!;
      const { selectedIds: selIds, select } = useSelectionStore.getState();
      if (!selIds.includes(itemId)) {
        select(itemId);
      }
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  }, []);

  const activateShapeTool = useCallback((kind?: ShapeKind) => {
    const targetKind = kind ?? activeShapeKind;
    if (kind) {
      setActiveShapeKind(kind);
    }
    setActiveTool(targetKind);
    useSelectionStore.getState().deselectAll();
    setIsTextToolLocked(false);
    setSelectedFreeTextId(null);
    setEditingFreeTextId(null);
    setSelectedDrawingId(null);
    setSelectedImageId(null);
    setSelectedShapeId(null);
    setCurrentPath([]);
    setEraserPath([]);
  }, [activeShapeKind]);

  const handleSelectShapeKind = useCallback((kind: ShapeKind) => {
    activateShapeTool(kind);
  }, [activateShapeTool]);

  const handleActivateShapeShortcut = useCallback(() => {
    activateShapeTool(activeShapeKind);
  }, [activeShapeKind, activateShapeTool]);

  useKeyboardShortcuts({
    onActivateShapeTool: handleActivateShapeShortcut,
  });

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [currentPath, setCurrentPath] = useState<CanvasPoint[]>([]);
  const [eraserPath, setEraserPath] = useState<CanvasPoint[]>([]);
  const [drawColor, setDrawColor] = useState("#1e1e1e");
  const [drawStrokeWidth, setDrawStrokeWidth] = useState(3);
  const [textColor, setTextColor] = useState("#1e1e1e");
  const [textFontSize, setTextFontSize] = useState(28);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const imageUploadInputRef = useRef<HTMLInputElement>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<any>(null);
  const hasAppliedInitialFitRef = useRef(false);
  const fitWorkspaceToViewport = useCallback(() => {
    const wrapper = wrapperRef.current;
    const instance = transformRef.current?.instance;
    if (!wrapper || !instance || items.length === 0) return;

    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const bounds = items.reduce(
      (acc, item) => {
        const radians = ((item.rotation ?? 0) * Math.PI) / 180;
        const rotatedWidth = Math.abs(item.w * Math.cos(radians)) + Math.abs(item.h * Math.sin(radians));
        const rotatedHeight = Math.abs(item.w * Math.sin(radians)) + Math.abs(item.h * Math.cos(radians));
        const centerX = item.x + item.w / 2;
        const centerY = item.y + item.h / 2;
        const left = centerX - rotatedWidth / 2;
        const top = centerY - rotatedHeight / 2;
        return {
          left: Math.min(acc.left, left),
          top: Math.min(acc.top, top),
          right: Math.max(acc.right, left + rotatedWidth),
          bottom: Math.max(acc.bottom, top + rotatedHeight),
        };
      },
      { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY },
    );

    const contentWidth = Math.max(1, bounds.right - bounds.left);
    const contentHeight = Math.max(1, bounds.bottom - bounds.top);
    const padding = Math.min(48, Math.max(20, Math.min(rect.width, rect.height) * 0.06));
    const scale = clampScale(Math.min((rect.width - padding * 2) / contentWidth, (rect.height - padding * 2) / contentHeight, 1));
    const positionX = (rect.width - contentWidth * scale) / 2 - bounds.left * scale;
    const positionY = (rect.height - contentHeight * scale) / 2 - bounds.top * scale;

    transformRef.current?.setTransform(positionX, positionY, scale, 180, "easeOut");
  }, [items]);
  const syncTimerRef = useRef<number | null>(null);
  const pendingFreeTextDismissPointerRef = useRef<number | null>(null);
  const outsideFreeTextDismissRef = useRef(false);
  const drawPointerSessionRef = useRef<PointerSession | null>(null);
  const textPointerSessionRef = useRef<PointerSession | null>(null);
  const stickyPointerSessionRef = useRef<PointerSession | null>(null);

  // If the user changes tools mid-gesture, release the old creation tool's
  // capture and discard its unfinished preview instead of leaving a stale
  // pointer session that blocks the next gesture.
  useEffect(() => {
    if (isDrawing || !drawPointerSessionRef.current) return;
    const session = drawPointerSessionRef.current;
    drawPointerSessionRef.current = endPointerSession(session, { pointerId: session.pointerId });
    setCurrentPath([]);
    setEraserPath([]);
  }, [isDrawing]);

  useEffect(() => {
    if (isTextToolActive || !textPointerSessionRef.current) return;
    const session = textPointerSessionRef.current;
    textPointerSessionRef.current = endPointerSession(session, { pointerId: session.pointerId });
  }, [isTextToolActive]);

  // Fit only a fresh/default workspace view. A saved non-default viewport is
  // respected, and this ref prevents resize/content updates from refitting it.
  useEffect(() => {
    hasAppliedInitialFitRef.current = false;
  }, [_workspaceId]);

  useEffect(() => {
    if (isLoading || workspaceId !== _workspaceId || hasAppliedInitialFitRef.current) return;

    // Mark an intentionally empty workspace as initialized too, so adding its
    // first object later does not unexpectedly move the user's canvas.
    if (items.length === 0) {
      hasAppliedInitialFitRef.current = true;
      return;
    }

    const isDefaultViewport = viewport.x === 0 && viewport.y === 0 && viewport.zoom === 1;
    if (!isDefaultViewport) {
      hasAppliedInitialFitRef.current = true;
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      fitWorkspaceToViewport();
      hasAppliedInitialFitRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items, isLoading, workspaceId, _workspaceId, viewport.x, viewport.y, viewport.zoom, fitWorkspaceToViewport]);

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    if (!wrapperRef.current) return { x: 0, y: 0 };
    const rect = wrapperRef.current.getBoundingClientRect();
    const ts = transformRef.current?.instance?.transformState;
    const scale = ts?.scale ?? 1;
    const posX = ts?.positionX ?? 0;
    const posY = ts?.positionY ?? 0;

    return {
      x: (clientX - rect.left - posX) / scale,
      y: (clientY - rect.top - posY) / scale,
    };
  }, []);

  const zoomAtClientPoint = useCallback((clientX: number, clientY: number, nextScale: number, animationTime = 140) => {
    if (!wrapperRef.current) return;

    const instance = transformRef.current?.instance;
    if (!instance) return;

    const rect = wrapperRef.current.getBoundingClientRect();
    const { scale, positionX, positionY } = instance.transformState;
    const clampedScale = clampScale(nextScale);
    const worldX = (clientX - rect.left - positionX) / scale;
    const worldY = (clientY - rect.top - positionY) / scale;
    const nextPositionX = clientX - rect.left - worldX * clampedScale;
    const nextPositionY = clientY - rect.top - worldY * clampedScale;

    transformRef.current?.setTransform(
      nextPositionX,
      nextPositionY,
      clampedScale,
      animationTime,
      "easeOut",
    );
  }, []);

  const importFileToWorkspace = useCallback(
    async (file: File, position?: { x: number; y: number }) => {
      const mimeType = file.type || "application/octet-stream";
      const assetKind = inferUploadAssetKind(mimeType, file.name);

      if (!assetKind) {
        toast.error(`Supported uploads: ${WORKSPACE_UPLOAD_ACCEPT}`);
        return;
      }

      const fallbackPosition = {
        x: -viewport.x / viewport.zoom + 120,
        y: -viewport.y / viewport.zoom + 120,
      };
      const nextPosition = position ?? fallbackPosition;

      const assetLabel = getAssetKindLabel(assetKind);
      toast.loading(`Uploading ${assetLabel}...`, { id: "upload" });
      const uploaded = await uploadWorkspaceAsset(file);
      const assetId = uploaded.assetId;
      const revisionId = uploaded.revisionId;

      registerWorkspaceAsset(assetId);


      if (assetKind === "pdf") {
        addItem(
          "pdf-fragment",
          {
            assetId,
            revisionId,
            pageNumber: 1,
            w: 400,
            h: 500,
          },
          nextPosition,
        );

        useViewerStore.getState().open(assetId, "pdf", 1);
        toast.success("PDF imported", { id: "upload" });
        return;
      }

      if (assetKind === "image") {
        addItem(
          "image",
          {
            assetId,
            src: `/api/assets/${assetId}/content`,
            alt: file.name,
            w: 360,
            h: 240,
          },
          nextPosition,
        );
        toast.success("Image imported", { id: "upload" });
        return;
      }

      useViewerStore
        .getState()
        .open(assetId, getViewerTypeForAssetKind(assetKind) ?? "video", 1);
      toast.success(`${assetLabel} imported`, { id: "upload" });
    },
    [addItem, viewport.x, viewport.y, viewport.zoom],
  );

  const handleToolbarImageUpload = useCallback(() => {
    imageUploadInputRef.current?.click();
  }, []);

  const handleToolbarImageSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (!file) {
        return;
      }

      const assetKind = inferUploadAssetKind(file.type, file.name);
      if (assetKind !== "image") {
        toast.error("Please choose an image file");
        return;
      }

      try {
        await importFileToWorkspace(file);
      } catch (error: any) {
        console.error("Toolbar image import failed", error);
        toast.error(error.message || "Failed to import image", { id: "upload" });
      }
    },
    [importFileToWorkspace],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();

      const internalData = event.dataTransfer.getData("application/vnd.second-brain.asset");
      const { x, y } = screenToWorld(event.clientX, event.clientY);
      if (internalData) {
        try {
          const asset = JSON.parse(internalData);
          const assetKind = typeof asset.kind === "string" ? asset.kind : asset.type;
          if (typeof asset.assetId === "string" && asset.assetId.length > 0) {
            registerWorkspaceAsset(asset.assetId);
          }

          if (assetKind === "image") {
            addItem(
              "image",
              {
                assetId: asset.assetId,
                src: `/api/assets/${asset.assetId}/content`,
                alt: asset.title,
                w: 360,
                h: 240,
              },
              { x, y },
            );
            toast.success("Image added to canvas");
            return;
          }

          const viewerType = getViewerTypeForAssetKind(assetKind);
          if (!viewerType) {
            toast.error("That asset can't be opened from the canvas yet");
            return;
          }

          const viewerStore = useViewerStore.getState();
          await viewerStore.open(asset.assetId, viewerType, 1);
          toast.success(`${getAssetKindLabel(assetKind)} opened`);
          return;
        } catch (error) {
          console.error("Internal drop failed", error);
          toast.error("Couldn't add that asset to the workspace");
        }
      }

      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];

      try {
        await importFileToWorkspace(file, { x, y });
      } catch (error: any) {
        console.error("Drop failed", error);
        toast.error(error.message || "Failed to import", { id: "upload" });
      }
    },
    [importFileToWorkspace, screenToWorld],
  );

  useEffect(() => {
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      void syncWithServer();
    }, 2000);

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [items, viewport, workspaceAssetIds, syncWithServer]);

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [_workspaceId]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const preventGestureDefault = (event: Event) => {
      event.preventDefault();
    };

    const preventNativePinchZoom = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };

    wrapper.addEventListener("gesturestart", preventGestureDefault, { passive: false });
    wrapper.addEventListener("gesturechange", preventGestureDefault, { passive: false });
    wrapper.addEventListener("gestureend", preventGestureDefault, { passive: false });
    wrapper.addEventListener("touchmove", preventNativePinchZoom, { passive: false });

    return () => {
      wrapper.removeEventListener("gesturestart", preventGestureDefault);
      wrapper.removeEventListener("gesturechange", preventGestureDefault);
      wrapper.removeEventListener("gestureend", preventGestureDefault);
      wrapper.removeEventListener("touchmove", preventNativePinchZoom);
    };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleCtrlWheelZoom = (event: WheelEvent) => {
      if (!event.ctrlKey || isDrawing) {
        return;
      }

      event.preventDefault();

      const instance = transformRef.current?.instance;
      if (!instance) return;

      const currentScale = instance.transformState.scale ?? 1;
      const zoomFactor = Math.exp(-event.deltaY * 0.01);
      zoomAtClientPoint(event.clientX, event.clientY, currentScale * zoomFactor, 40);
    };

    wrapper.addEventListener("wheel", handleCtrlWheelZoom, { passive: false });

    return () => {
      wrapper.removeEventListener("wheel", handleCtrlWheelZoom);
    };
  }, [isDrawing, zoomAtClientPoint]);

  useEffect(() => {
    if (selectedFreeTextId && !items.some((item) => item.id === selectedFreeTextId)) {
      setSelectedFreeTextId(null);
    }
    if (selectedDrawingId && !items.some((item) => item.id === selectedDrawingId)) {
      setSelectedDrawingId(null);
    }
    if (selectedImageId && !items.some((item) => item.id === selectedImageId)) {
      setSelectedImageId(null);
    }
    if (selectedShapeId && !items.some((item) => item.id === selectedShapeId)) {
      setSelectedShapeId(null);
    }
    if (editingFreeTextId && !items.some((item) => item.id === editingFreeTextId)) {
      setEditingFreeTextId(null);
      setIsTextToolActive(false);
    }
  }, [editingFreeTextId, items, selectedDrawingId, selectedFreeTextId, selectedImageId, selectedShapeId]);

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        if (e.shiftKey) {
          activateTextTool(true);
          toast.success("Text Tool Locked (Multi-Write Mode)");
        } else {
          activateTextTool(false);
          toast.success("Text Tool Selected");
        }
      } else if (e.key === "Escape") {
        // Reset the unified tool state directly
        setActiveTool("select");
        setIsTextToolLocked(false);
        setEditingFreeTextId(null);
        setSelectedDrawingId(null);
        setSelectedShapeId(null);
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => {
      window.removeEventListener("keydown", handleGlobalShortcuts);
    };
  }, [activateTextTool]);

  useEffect(() => {
    if (!selectedFreeTextId || editingFreeTextId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const selectedTextRoot = target.closest(
        `[data-free-text-id="${selectedFreeTextId}"]`,
      );
      const textToolbar = target.closest('[data-text-toolbar="true"]');

      if (selectedTextRoot || textToolbar) {
        return;
      }

      setSelectedFreeTextId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [editingFreeTextId, selectedFreeTextId]);

  useEffect(() => {
    if (!selectedDrawingId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const selectedDrawingRoot = target.closest(`[data-drawing-id="${selectedDrawingId}"]`);
      if (selectedDrawingRoot) {
        return;
      }

      setSelectedDrawingId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [selectedDrawingId]);

  useEffect(() => {
    if (!selectedImageId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const selectedImageRoot = target.closest(`[data-image-id="${selectedImageId}"]`);
      if (selectedImageRoot) {
        return;
      }

      setSelectedImageId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [selectedImageId]);

  useEffect(() => {
    if (!selectedShapeId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const selectedShapeRoot = target.closest(`[data-shape-id="${selectedShapeId}"]`);
      if (selectedShapeRoot || target.closest('[data-shape-style-toolbar="true"]')) {
        return;
      }

      setSelectedShapeId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [selectedShapeId]);

  const activeFreeText = items.find(
    (item) =>
      item.type === "free-text" &&
      item.id === (editingFreeTextId ?? selectedFreeTextId),
  );

  useEffect(() => {
    if (activeFreeText?.type !== "free-text") {
      return;
    }

    setTextColor(activeFreeText.props.color ?? "#1e1e1e");
    setTextFontSize(activeFreeText.props.fontSize ?? 28);
  }, [activeFreeText]);

  const commitDrawingItems = useCallback(
    (nextItems: StudioItem[]) => {
      setUndoStack((prev) => [...prev, cloneItemsSnapshot(items)]);
      setRedoStack([]);
      updateItems(nextItems);
    },
    [items, updateItems],
  );

  const eraserRadius = Math.max(drawStrokeWidth * 2, 14);

  const eraseAtPath = useCallback(
    (path: CanvasPoint[]) => {
      if (path.length === 0) return;
      const eraserSamples = resamplePolyline(path, 3);
      const nextItems = items.filter((item) => {
        if (item.type === "shape") {
          const rotation = ((item.rotation ?? 0) * Math.PI) / 180;
          const cos = Math.cos(rotation), sin = Math.sin(rotation);
          const centerX = item.x + item.w / 2, centerY = item.y + item.h / 2;
          return !eraserSamples.some((point) => {
            const dx = point.x - centerX, dy = point.y - centerY;
            const localX = dx * cos + dy * sin + item.w / 2;
            const localY = -dx * sin + dy * cos + item.h / 2;
            return localX >= -eraserRadius && localX <= item.w + eraserRadius &&
              localY >= -eraserRadius && localY <= item.h + eraserRadius;
          });
        }
        if (item.type !== "drawing") return true;
        const localPoints = item.props.points;
        if (!localPoints?.length) {
          // Backward-compatible fallback for old imported drawings that only
          // contain an SVG path and no source samples.
          return !eraserSamples.some((point) =>
            point.x >= item.x - eraserRadius && point.x <= item.x + item.w + eraserRadius &&
            point.y >= item.y - eraserRadius && point.y <= item.y + item.h + eraserRadius
          );
        }
        const worldPoints = localPoints.map((point) => ({
          x: item.x + point.x, y: item.y + point.y, pressure: point.pressure,
        }));
        return !strokeIntersectsPolyline(worldPoints, eraserSamples, eraserRadius, item.props.strokeWidth);
      });
      if (nextItems.length !== items.length) commitDrawingItems(nextItems);
    },
    [commitDrawingItems, eraserRadius, items],
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      setRedoStack((future) => [...future, cloneItemsSnapshot(items)]);
      updateItems(cloneItemsSnapshot(previous));
      return prev.slice(0, -1);
    });
  }, [items, updateItems]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setUndoStack((past) => [...past, cloneItemsSnapshot(items)]);
      updateItems(cloneItemsSnapshot(next));
      return prev.slice(0, -1);
    });
  }, [items, updateItems]);

  const handleClearAll = useCallback(() => {
    const drawingItems = items.filter((item) => item.type === "drawing");
    if (drawingItems.length === 0) return;
    const nextItems = items.filter((item) => item.type !== "drawing");
    commitDrawingItems(nextItems);
    toast.success("All drawings cleared");
  }, [commitDrawingItems, items]);

  const handleDrawPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const session = beginPointerSession(e, e.currentTarget, drawPointerSessionRef.current);
      if (!session) return;
      drawPointerSessionRef.current = session;

      const { x, y } = screenToWorld(e.clientX, e.clientY);
      const pressure = e.pointerType === "mouse" || e.pressure <= 0 ? 0.5 : e.pressure;
      const point = { x, y, pressure };
      setMousePos({ x, y });

      if (drawTool === "eraser") setEraserPath([point]);
      else setCurrentPath([point]);
    },
    [drawTool, screenToWorld],
  );

  const handleDrawPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!ownsPointerSession(drawPointerSessionRef.current, e)) return;
      e.stopPropagation();
      e.preventDefault();
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      const pressure = e.pointerType === "mouse" || e.pressure <= 0 ? 0.5 : e.pressure;
      const point = { x, y, pressure };
      setMousePos({ x, y });

      if ((drawTool === "pen" || drawTool === "highlighter") && currentPath.length > 0) {
        setCurrentPath((prev) => [...prev, point]);
      }
      if (drawTool === "eraser" && eraserPath.length > 0) {
        setEraserPath((prev) => [...prev, point]);
      }
    },
    [currentPath.length, drawTool, eraserPath.length, screenToWorld],
  );

  const handleDrawPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const session = drawPointerSessionRef.current;
      if (!ownsPointerSession(session, e)) return;
      drawPointerSessionRef.current = endPointerSession(session, e);
      e.stopPropagation();
      e.preventDefault();

      const { x, y } = screenToWorld(e.clientX, e.clientY);
      const pressure = e.pointerType === "mouse" || e.pressure <= 0 ? 0.5 : e.pressure;
      const finalPoint = { x, y, pressure };
      const lastPenPoint = currentPath[currentPath.length - 1];
      const completedPenPath =
        currentPath.length > 0 && (!lastPenPoint || lastPenPoint.x !== x || lastPenPoint.y !== y)
          ? [...currentPath, finalPoint]
          : currentPath;
      const lastEraserPoint = eraserPath[eraserPath.length - 1];
      const completedEraserPath =
        eraserPath.length > 0 && (!lastEraserPoint || lastEraserPoint.x !== x || lastEraserPoint.y !== y)
          ? [...eraserPath, finalPoint]
          : eraserPath;

      if ((drawTool === "pen" || drawTool === "highlighter") && completedPenPath.length > 0) {
        const drawing = createDrawingFromWorldPoints(completedPenPath, drawColor, drawStrokeWidth);
        const newItem = createWorkspaceItem("drawing", drawing, {
          x: drawing.x,
          y: drawing.y,
          zIndex: items.length > 0 ? Math.max(...items.map((item) => item.zIndex)) + 1 : 1,
        });

        if (newItem) {
          commitDrawingItems([...items, newItem]);
        }

        setCurrentPath([]);
      }

      if (drawTool === "eraser" && completedEraserPath.length > 0) {
        eraseAtPath(completedEraserPath);
        setEraserPath([]);
      }

      if (drawTool === "pen") {
        setCurrentPath([]);
      }
    },
    [commitDrawingItems, currentPath, drawColor, drawStrokeWidth, drawTool, eraserPath, eraseAtPath, items, screenToWorld],
  );

  const handleTextPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();

      const { x, y } = screenToWorld(e.clientX, e.clientY);
      const nextId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? `item-${crypto.randomUUID()}`
          : `item-${Math.random().toString(36).slice(2, 11)}`;
      const nextItem = createWorkspaceItem(
        "free-text",
        {
          text: "",
          fontSize: textFontSize,
          color: textColor,
        },
        {
          id: nextId,
          x,
          y,
          zIndex: items.length > 0 ? Math.max(...items.map((item) => item.zIndex)) + 1 : 1,
        },
      );

      if (!nextItem) {
        return;
      }

      updateItems([...items, nextItem]);
      setSelectedFreeTextId(nextId);
      setEditingFreeTextId(nextId);
    },
    [items, screenToWorld, textColor, textFontSize, updateItems],
  );

  const handleFreeTextColorChange = useCallback(
    (color: string) => {
      setTextColor(color);

      const targetId = editingFreeTextId ?? selectedFreeTextId;
      if (!targetId) return;

      updateItems(
        items.map((item) =>
          item.type === "free-text" && item.id === targetId
            ? {
              ...item,
              props: {
                ...item.props,
                color,
              },
            }
            : item,
        ) as StudioItem[],
      );
    },
    [editingFreeTextId, items, selectedFreeTextId, updateItems],
  );

  const handleFreeTextSizeChange = useCallback(
    (fontSize: number) => {
      setTextFontSize(fontSize);

      const targetId = editingFreeTextId ?? selectedFreeTextId;
      if (!targetId) return;

      updateItems(
        items.map((item) =>
          item.type === "free-text" && item.id === targetId
            ? {
              ...item,
              props: {
                ...item.props,
                fontSize,
              },
            }
            : item,
        ) as StudioItem[],
      );
    },
    [editingFreeTextId, items, selectedFreeTextId, updateItems],
  );

  const handleFreeTextSelect = useCallback((itemId: string) => {
    const item = items.find((candidate) => candidate.id === itemId);
    const groupId = item ? (item.props as { groupId?: string }).groupId : undefined;
    const groupIds = groupId
      ? items
          .filter((candidate) => (candidate.props as { groupId?: string }).groupId === groupId)
          .map((candidate) => candidate.id)
      : [itemId];
    const selection = useSelectionStore.getState();
    if (!selection.selectedIds.includes(itemId)) {
      selection.clearAndSelectIds(groupIds);
    }
    setSelectedFreeTextId(itemId);
    setEditingFreeTextId(null);
  }, [items]);

  const startFreeTextEditing = useCallback((itemId: string) => {
    setIsTextToolActive(true);
    setSelectedFreeTextId(itemId);
    setEditingFreeTextId(itemId);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full relative bg-[#f8fafc] overflow-visible"
      data-workspace-canvas="true"
      style={{
        cursor: isDrawing && drawTool === "eraser" ? "none" : undefined,
        touchAction: "none",
      }}
      onPointerDownCapture={(e) => {
        if (!e.isPrimary || e.button !== 0 || canvasGestureRef.current) return;
        const target = e.target instanceof Element ? e.target : null;
        const isControl = !!target?.closest(
          'button, input, textarea, select, [contenteditable="true"], [role="button"], [data-no-canvas-gesture]'
        );
        if (isControl) return;

        const isCanvasTool = activeTool === "select" || activeTool === "pan" ||
          isDrawing || isTextToolActive || isShapeToolActive || isStickyToolActive;
        if (!isCanvasTool) return;
        if ((activeTool === "select" || isStickyToolActive) && target?.closest('[data-workspace-item="true"]')) return;

        if (activeTool === "select" && editingStickyId) {
          // Dismiss sticky editing and clear the shared selection in this same
          // outside-pointer interaction. The textarea's blur handler only ends
          // editing; it must not leave the sticky selected for an extra click.
          const activeElement = document.activeElement;
          if (activeElement instanceof HTMLTextAreaElement) activeElement.blur();
          setEditingStickyId(null);
          setSelectedStickyId(null);
          useSelectionStore.getState().deselectAll();
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        const world = screenToWorld(e.clientX, e.clientY);
        const transformState = transformRef.current?.instance?.transformState;
        const mode: "pan" | "select" | "dismiss-text" | "draw" | "text" | "shape" | "sticky" =
          editingFreeTextId && !target?.closest("[data-free-text-root]")
            ? "dismiss-text"
            : isPanning ? "pan"
            : isDrawing ? "draw"
            : isTextToolActive ? "text"
            : isShapeToolActive ? "shape"
            : isStickyToolActive ? "sticky"
            : "select";

        canvasGestureRef.current = {
          pointerId: e.pointerId,
          mode,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startWorldX: world.x,
          startWorldY: world.y,
          startTransformX: transformState?.positionX ?? 0,
          startTransformY: transformState?.positionY ?? 0,
          scale: transformState?.scale ?? viewport.zoom ?? 1,
        };

        if (mode === "select") {
          setContextMenu(null);
          setSelectedStickyId(null);
          setEditingStickyId(null);
          setSelectedFreeTextId(null);
          setSelectedDrawingId(null);
          setSelectedImageId(null);
          useSelectionStore.getState().deselectAll();
          setSelectionBox({ startX: world.x, startY: world.y, currentX: world.x, currentY: world.y });
          setSelectionScreenBox({
            startX: e.clientX - rect.left,
            startY: e.clientY - rect.top,
            currentX: e.clientX - rect.left,
            currentY: e.clientY - rect.top,
          });
        } else if (mode === "pan") {
          setIsPanDragging(true);
        } else if (mode === "draw") {
          handleDrawPointerDown(e);
        } else if (mode === "text") {
          const session = beginPointerSession(e, e.currentTarget, textPointerSessionRef.current);
          if (!session) {
            canvasGestureRef.current = null;
            return;
          }
          textPointerSessionRef.current = session;
        } else if (mode === "shape") {
          shapePointerHandlersRef.current?.down(e);
        } else if (mode === "sticky") {
          const session = beginPointerSession(e, e.currentTarget, stickyPointerSessionRef.current);
          if (!session) {
            canvasGestureRef.current = null;
            return;
          }
          stickyPointerSessionRef.current = session;
          const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? "item-" + crypto.randomUUID()
            : "item-" + Math.random().toString(36).slice(2, 11);
          const note = createWorkspaceItem("sticky", { text: "", color: stickyColor, w: 220, h: 220, rotation: 0 }, {
            id,
            x: world.x,
            y: world.y,
            zIndex: items.length > 0 ? Math.max(...items.map((item) => item.zIndex)) + 1 : 1,
          });
          if (note) updateItems([...items, note]);
          setSelectedStickyId(id);
          setEditingStickyId(id);
          setActiveTool("select");
        } else {
          pendingFreeTextDismissPointerRef.current = e.pointerId;
        }

        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerMoveCapture={(e) => {
        const gesture = canvasGestureRef.current;
        if (!gesture || gesture.pointerId !== e.pointerId) return;
        if (gesture.mode === "draw") {
          handleDrawPointerMove(e);
          return;
        }
        if (gesture.mode === "shape") {
          shapePointerHandlersRef.current?.move(e);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (gesture.mode === "dismiss-text" || gesture.mode === "text" || gesture.mode === "sticky") return;
        if (gesture.mode === "pan") {
          transformRef.current?.setTransform(
            gesture.startTransformX + (e.clientX - gesture.startClientX),
            gesture.startTransformY + (e.clientY - gesture.startClientY),
            gesture.scale,
            0,
          );
          return;
        }

        const world = screenToWorld(e.clientX, e.clientY);
        const rect = wrapperRef.current?.getBoundingClientRect();
        setSelectionBox((prev) => prev ? { ...prev, currentX: world.x, currentY: world.y } : null);
        if (rect) {
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          setSelectionScreenBox((prev) => prev ? { ...prev, currentX: sx, currentY: sy } : null);
        }
        const x = Math.min(gesture.startWorldX, world.x);
        const y = Math.min(gesture.startWorldY, world.y);
        const w = Math.abs(gesture.startWorldX - world.x);
        const h = Math.abs(gesture.startWorldY - world.y);
        const collidingIds = items
          .filter((item) => isIntersecting(
            { x: item.x, y: item.y, w: item.w, h: item.h },
            { x, y, w, h },
          ))
          .map((item) => item.id);
        useSelectionStore.getState().clearAndSelectIds(collidingIds);
      }}
      onPointerUpCapture={(e) => {
        const gesture = canvasGestureRef.current;
        if (!gesture || gesture.pointerId !== e.pointerId) return;
        canvasGestureRef.current = null;
        if (gesture.mode === "draw") {
          handleDrawPointerUp(e);
        } else if (gesture.mode === "text") {
          const session = textPointerSessionRef.current;
          if (ownsPointerSession(session, e)) textPointerSessionRef.current = endPointerSession(session, e);
          handleTextPointerUp(e);
        } else if (gesture.mode === "shape") {
          shapePointerHandlersRef.current?.up(e);
        } else if (gesture.mode === "sticky") {
          const session = stickyPointerSessionRef.current;
          if (ownsPointerSession(session, e)) stickyPointerSessionRef.current = endPointerSession(session, e);
        } else if (gesture.mode === "select") {
          setSelectionBox(null);
          setSelectionScreenBox(null);
        } else if (gesture.mode === "pan") {
          setIsPanDragging(false);
        } else {
          pendingFreeTextDismissPointerRef.current = null;
          e.preventDefault();
          e.stopPropagation();
          outsideFreeTextDismissRef.current = true;
          const activeElement = document.activeElement;
          if (activeElement instanceof HTMLTextAreaElement) activeElement.blur();
          outsideFreeTextDismissRef.current = false;
          setEditingFreeTextId(null);
          setSelectedFreeTextId(null);
          if (!isTextToolLocked) setIsTextToolActive(false);
        }
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancelCapture={(e) => {
        const gesture = canvasGestureRef.current;
        if (!gesture || gesture.pointerId !== e.pointerId) return;
        canvasGestureRef.current = null;
        if (gesture.mode === "draw") {
          const session = drawPointerSessionRef.current;
          if (ownsPointerSession(session, e)) drawPointerSessionRef.current = endPointerSession(session, e);
          setCurrentPath([]);
          setEraserPath([]);
        } else if (gesture.mode === "text") {
          const session = textPointerSessionRef.current;
          if (ownsPointerSession(session, e)) textPointerSessionRef.current = endPointerSession(session, e);
        } else if (gesture.mode === "shape") {
          shapePointerHandlersRef.current?.cancel(e);
        } else if (gesture.mode === "sticky") {
          const session = stickyPointerSessionRef.current;
          if (ownsPointerSession(session, e)) stickyPointerSessionRef.current = endPointerSession(session, e);
        }
        setSelectionBox(null);
        setSelectionScreenBox(null);
        setIsPanDragging(false);
        if (pendingFreeTextDismissPointerRef.current === e.pointerId) pendingFreeTextDismissPointerRef.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onLostPointerCapture={(e) => {
        const gesture = canvasGestureRef.current;
        if (!gesture || gesture.pointerId !== e.pointerId) return;
        canvasGestureRef.current = null;
        if (gesture.mode === "draw") {
          const session = drawPointerSessionRef.current;
          if (ownsPointerSession(session, e)) drawPointerSessionRef.current = clearPointerSession(session, e);
          setCurrentPath([]);
          setEraserPath([]);
        } else if (gesture.mode === "text") {
          const session = textPointerSessionRef.current;
          if (ownsPointerSession(session, e)) textPointerSessionRef.current = clearPointerSession(session, e);
        } else if (gesture.mode === "shape") {
          shapePointerHandlersRef.current?.lostCapture(e);
        } else if (gesture.mode === "sticky") {
          const session = stickyPointerSessionRef.current;
          if (ownsPointerSession(session, e)) stickyPointerSessionRef.current = clearPointerSession(session, e);
        }
        setSelectionBox(null);
        setSelectionScreenBox(null);
        setIsPanDragging(false);
      }}
    >
      <svg className="absolute w-0 h-0 pointer-events-none" style={{ position: "absolute", width: 0, height: 0, visibility: "hidden" }}>
        <defs>
          <filter id="studenv-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.06" />
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.04" />
          </filter>
          <filter id="studenv-hover-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.08" />
            <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="#0f172a" floodOpacity="0.06" />
          </filter>
        </defs>
      </svg>
      <input
        ref={imageUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleToolbarImageSelected}
      />
      <TransformWrapper
        ref={transformRef}
        initialScale={viewport.zoom}
        initialPositionX={viewport.x}
        initialPositionY={viewport.y}
        minScale={0.1}
        maxScale={5}
        centerOnInit={false}
        centerZoomedOut={false}
        limitToBounds={false}
        onTransformed={(p) => {
          updateViewport({
            x: p.state.positionX,
            y: p.state.positionY,
            zoom: p.state.scale,
          });
        }}
        smooth
        doubleClick={{ disabled: true }}
        panning={{
          // All pan gestures are routed through the canvas Pointer Events controller.
          disabled: true,
          wheelPanning: true,
          allowLeftClickPan: false,
          excluded: [],
        }}
        pinch={{ disabled: isDrawing || isShapeToolActive || isTextToolActive || isStickyToolActive }}
        wheel={{
          disabled: isDrawing,
          wheelDisabled: true,
          touchPadDisabled: true,
        }}
        zoomAnimation={{
          size: 0.18,
          animationTime: 140,
          animationType: "easeOut",
        }}
      >
        {(utils) => (
          <>
            <TransformComponent wrapperClass="!w-full !h-full">
              <div
                className="relative w-[10000px] h-[10000px]"
                data-workspace-interaction={isPanning ? "pan" : "select"}
                data-pan-dragging={isPanDragging ? "true" : "false"}
                style={{
                  cursor: isPanning ? (isPanDragging ? "grabbing" : "grab") : "default",
                  backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                  touchAction: "none",
                }}
                onDragOver={(e: React.DragEvent) => e.preventDefault()}
                onDrop={handleDrop}
                onContextMenu={handleContextMenu}
                onDoubleClick={(e) => {
                  if (e.target === e.currentTarget && !isDrawing) {
                    const { x, y } = screenToWorld(e.clientX, e.clientY);
                    addItem("text", { text: "" }, { x, y });
                  }
                }}
                
              >
                {isDrawing && (
                  <div
                    className="pointer-events-none absolute inset-0 z-[10000]"
                    style={{
                      cursor: drawTool === "eraser" ? "none" : "crosshair",
                      touchAction: "none",
                    }}
                  />
                )}

                {isTextToolActive && !isDrawing && !editingFreeTextId && (
                  <div
                    className="pointer-events-none absolute inset-0 z-[10000]"
                    style={{ cursor: "text", touchAction: "none" }}
                  />
                )}

                {isShapeToolActive && (
                  <ShapeCreationOverlay
                    activeShapeKind={activeShapeKind}
                    screenToWorld={screenToWorld}
                    pointerHandlersRef={shapePointerHandlersRef}
                    onComplete={() => {
                      setIsShapeToolActive(false);
                    }}
                  />
                )}

                {currentPath.length > 0 && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-[999]">
                    <path
                      d={outlineToPath(createStrokeOutline(currentPath, drawStrokeWidth))}
                      fill={drawColor}
                      fillOpacity={drawTool === "highlighter" ? 0.35 : 1}
                    />
                  </svg>
                )}

                {isDrawing && drawTool === "eraser" && (
                  <div
                    className="absolute pointer-events-none rounded-full border border-red-500/70 bg-red-500/10 z-[1000]"
                    style={{
                      width: eraserRadius * 2,
                      height: eraserRadius * 2,
                      left: mousePos.x - eraserRadius,
                      top: mousePos.y - eraserRadius,
                    }}
                  />
                )}

                {items.map((item) => (
                  <StudioItemComponent
                    key={item.id}
                    item={item}
                    // Sticky notes own their text input; other tools must never disable their pointer events.
                    isDrawingMode={item.type === "sticky" ? false : isDrawing || (isTextToolActive && !editingFreeTextId) || isShapeToolActive}
                    canvasScale={viewport.zoom}
                    onPointerEnter={() => {
                      if (!isPanning && !isDrawing && !isShapeToolActive && !isTextToolActive) {
                        setHoveredItemId(item.id);
                      }
                    }}
                    onPointerLeave={() => {
                      setHoveredItemId((prev) => (prev === item.id ? null : prev));
                    }}
                    disableDragging={
                      isPanning || (
                        item.type === "sticky"
                          ? false
                          : item.type === "free-text"
                            ? editingFreeTextId === item.id || (!selectedIds.includes(item.id) && selectedFreeTextId !== item.id)
                            : item.type === "drawing"
                              ? false
                              : isMigratedToSelectionOverlay(item.type)
                                ? ('locked' in item.props && item.props.locked) || !selectedIds.includes(item.id)
                                : selectedIds.includes(item.id) ? ('locked' in item.props && item.props.locked) : undefined
                      )
                    }
                    enableResizing={
                      isPanning
                        ? false
                        : item.type === "sticky" || item.type === "free-text" || item.type === "drawing" || isMigratedToSelectionOverlay(item.type)
                        ? false
                        : undefined
                    }
                    showDeleteButton={!isPanning && selectedIds.includes(item.id)}
                    passThrough={isPanning}
                    showRotateButton={
                      !isPanning && ((item.type === "drawing" && selectedDrawingId === item.id) ||
                      (item.type === "image" && selectedImageId === item.id) ||
                      (isMigratedToSelectionOverlay(item.type) && selectedIds.includes(item.id) && !('locked' in item.props && item.props.locked)))
                    }
                    onRotateChange={(rotation) => {
                      updateItem(item.id, { rotation });
                    }}
                    onDrag={(draggedItemId, x, y) => {
                      if (!isMigratedToSelectionOverlay(item.type)) {
                        return { x, y };
                      }

                      const draggedIds = selectedIds.includes(draggedItemId)
                        ? selectedIds
                        : [draggedItemId];
                      const otherBounds = items
                        .filter((other) => !draggedIds.includes(other.id))
                        .map((other) => ({
                          x: other.x,
                          y: other.y,
                          w: other.w,
                          h: other.h,
                        }));
                      const snap = computeSnap(
                        { x, y, w: item.w, h: item.h },
                        otherBounds,
                        6,
                      );
                      setSnapGuides(snap.guides);

                      return { x: snap.x, y: snap.y };
                    }}
                    onDragStop={() => setSnapGuides([])}
                    onPointerDown={(event) => {
                      if (isPanning) return;
                      const selection = useSelectionStore.getState();
                      const selectedBeforePointer = selection.selectedIds;
                      const targetIds = [item.id];
                      const groupId = (item.props as { groupId?: string }).groupId;
                      if (groupId) {
                        const groupMembers = items
                          .filter((candidate) => (candidate.props as { groupId?: string }).groupId === groupId)
                          .map((candidate) => candidate.id);
                        targetIds.push(...groupMembers.filter((id) => id !== item.id));
                      }

                      const isAlreadySelected = targetIds.some((id) => selectedBeforePointer.includes(id));
                      if (event.shiftKey) {
                        if (isAlreadySelected) {
                          selection.clearAndSelectIds(selectedBeforePointer.filter((id) => !targetIds.includes(id)));
                        } else {
                          selection.selectIds(targetIds);
                        }
                      } else if (!isAlreadySelected || selectedBeforePointer.length === 0) {
                        selection.clearAndSelectIds(targetIds);
                      }

                      // Editing is a separate intent from selecting. Never enter an
                      // editor when the pointer is operating on a multi-selection.
                      const nextSelection = useSelectionStore.getState().selectedIds;
                      const isSingleSelection = nextSelection.length === 1 && nextSelection[0] === item.id;
                      if (item.type === "sticky") {
                        setActiveTool("select");
                        setIsTextToolLocked(false);
                        setSelectedFreeTextId(null);
                        setEditingFreeTextId(null);
                        setSelectedDrawingId(null);
                        setSelectedImageId(null);
                        setSelectedShapeId(null);
                        setSelectedStickyId(item.id);
                        setEditingStickyId(
                          !event.shiftKey && selectedStickyId === item.id && isAlreadySelected && isSingleSelection
                            ? item.id
                            : null
                        );
                        return;
                      }

                      setSelectedStickyId(null);
                      setEditingStickyId(null);
                      setSelectedImageId(null);
                      setSelectedShapeId(null);

                      if (item.type === "free-text") {
                        setSelectedDrawingId(null);
                        setSelectedFreeTextId(item.id);
                        setEditingFreeTextId(
                          !event.shiftKey && selectedFreeTextId === item.id && isAlreadySelected && isSingleSelection
                            ? item.id
                            : null
                        );
                      } else {
                        setSelectedFreeTextId(null);
                        setEditingFreeTextId(null);
                        if (item.type === "drawing") {
                          setSelectedDrawingId(item.id);
                        } else {
                          setSelectedDrawingId(null);
                        }
                      }
                      if (item.type !== "free-text") {
                        setIsTextToolActive(false);
                      }
                    }}
                    className={[
                      item.type === "drawing" && selectedDrawingId === item.id
                          ? "rounded-md ring-2 ring-slate-500/60"
                          : isMigratedToSelectionOverlay(item.type)
                            ? ""
                            : item.type === "free-text" && (selectedFreeTextId === item.id || editingFreeTextId === item.id)
                              ? "rounded-md ring-2 ring-indigo-400/70"
                              : "",
                      !isMigratedToSelectionOverlay(item.type) && selectedIds.includes(item.id)
                        ? "ring-2 ring-[#f5a623] ring-offset-1 rounded-md"
                        : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {item.type === "pdf-fragment" && <PdfFragment item={item} />}
                    {item.type === "video-anchor" && <VideoAnchor item={item} />}
                    {item.type === "text" && <TextNode item={item as any} />}
                    {item.type === "sticky" && (
                      <StickyNode
                        item={item as any}
                        isSelected={selectedIds.length === 1 && selectedIds[0] === item.id}
                        isEditing={editingStickyId === item.id}
                        onColorChange={(color) => {
                          setStickyColor(color);
                          useWorkspaceStore.getState().updateItemProps(item.id, { color });
                        }}
                        onFinishEditing={() => setEditingStickyId(null)}
                      />
                    )}
                    {item.type === "free-text" && (
                      <FreeTextNode
                        item={item as any}
                        isSelected={selectedIds.length === 1 && selectedIds[0] === item.id}
                        isEditing={editingFreeTextId === item.id}
                        onSelect={() => {
                          if (isPanning) return;
                          handleFreeTextSelect(item.id);
                        }}
                        onStartEditing={() => {
                          if (isPanning) return;
                          startFreeTextEditing(item.id);
                        }}
                        onFinishEditing={(saved) => {
                          if (outsideFreeTextDismissRef.current || !saved) {
                            setSelectedFreeTextId(null);
                          } else {
                            setSelectedFreeTextId(item.id);
                          }
                          setEditingFreeTextId(null);
                          if (!isTextToolLocked) {
                            setIsTextToolActive(false);
                          }
                        }}
                      />
                    )}
                    {item.type === "drawing" && (
                      <DrawingNode
                        item={item as any}
                        isSelected={selectedIds.length === 1 && selectedIds[0] === item.id}
                        onSelect={() => {
                          if (isPanning) return;
                          setSelectedFreeTextId(null);
                          setEditingFreeTextId(null);
                          setIsTextToolActive(false);
                          setSelectedDrawingId(item.id);
                        }}
                      />
                    )}
                    {item.type === "image" && <ImageNode item={item as any} />}
                    {item.type === "shape" && (
                      <ShapeNode
                        item={item as any}
                        isSelected={selectedIds.includes(item.id)}
                      />
                    )}
                  </StudioItemComponent>
                ))}

                <SnapGuidesOverlay guides={snapGuides} />

                {/* Keep selection outlines visible in Pan mode, but disable their handles. */}
                <SelectionOverlay
                  canvasScale={viewport.zoom}
                  screenToWorld={screenToWorld}
                  hoveredItemId={hoveredItemId}
                  interactive={!isPanning}
                />
              </div>
            </TransformComponent>


            <ZoomControls utils={utils} />
            <AssetDrawer />

            {isDrawing && (
              <DrawingToolbar
                activeTool={drawTool}
                onToolChange={setDrawTool}
                strokeWidth={drawStrokeWidth}
                onStrokeWidthChange={setDrawStrokeWidth}
                color={drawColor}
                onColorChange={setDrawColor}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onClearAll={handleClearAll}
                canUndo={undoStack.length > 0}
                canRedo={redoStack.length > 0}
              />
            )}

            <ShapeStyleToolbar />

            {contextMenu && (
              <ShapeContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                onClose={() => setContextMenu(null)}
              />
            )}

            {selectedIds.length <= 1 && (isTextToolActive || !!selectedFreeTextId || !!editingFreeTextId) && (
              <TextToolbar
                color={textColor}
                onColorChange={handleFreeTextColorChange}
                fontSize={textFontSize}
                onFontSizeChange={handleFreeTextSizeChange}
              />
            )}

            {/* Full tool rail for desktop and tablet */}
            <div className="fixed top-20 left-4 z-[11000] hidden sm:flex flex-col gap-2 bg-white shadow-lg border rounded-lg p-1">
              <button
                onClick={() => {
                  setActiveTool("select");
                  setIsTextToolLocked(false);
                  setEditingFreeTextId(null);
                }}
                className={`p-2 rounded-md transition-colors ${activeTool === "select" ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-400"}`}
                title="Select Mode"
              ><MousePointer2 size={18} /></button>
              <button
                onClick={() => {
                  setActiveTool("pan");
                  setIsTextToolLocked(false);
                  setEditingFreeTextId(null);
                }}
                className={`p-2 rounded-md transition-colors ${isPanning ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-400"}`}
                title="Pan Mode"
              ><Hand size={18} /></button>
              <div className="h-px bg-slate-100 my-1 mx-2" />
              <ShapeToolButton
                activeShapeKind={activeShapeKind}
                isActive={isShapeToolActive}
                onSelectShapeKind={handleSelectShapeKind}
                onOpen={() => handleSelectShapeKind(activeShapeKind)}
              />
              <div className="h-px bg-slate-100 my-1 mx-2" />
              <button
                onClick={() => {
                  setActiveTool(activeTool === "sticky" ? "select" : "sticky");
                  useSelectionStore.getState().deselectAll();
                  setSelectedShapeId(null);
                  setSelectedImageId(null);
                  setSelectedDrawingId(null);
                  setSelectedFreeTextId(null);
                  setEditingFreeTextId(null);
                  setEditingStickyId(null);
                  setSelectedStickyId(null);
                  setIsTextToolLocked(false);
                }}
                className={`p-2 rounded-md transition-colors ${isStickyToolActive ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-400"}`}
                title="Sticky Note — click the canvas to place"
              ><StickyNote size={18} /></button>
              <button
                onClick={() => { useSelectionStore.getState().deselectAll(); setSelectedShapeId(null); setSelectedImageId(null); setSelectedDrawingId(null); setSelectedStickyId(null); activateTextTool(false); }}
                onDoubleClick={() => activateTextTool(true)}
                className={`relative p-2 rounded-md transition-colors ${isTextToolActive ? (isTextToolLocked ? "bg-amber-100 text-amber-700 ring-2 ring-amber-500/50" : "bg-indigo-50 text-indigo-600") : "hover:bg-slate-50 text-slate-400"}`}
                title="Text Tool (T) - Double-click to lock"
              >
                <Type size={18} />
                {isTextToolLocked && <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white shadow-sm ring-1 ring-white"><Lock size={8} strokeWidth={3} /></span>}
              </button>
              <button
                onClick={() => {
                  setActiveTool(isDrawing ? "select" : drawTool);
                  useSelectionStore.getState().deselectAll();
                  setSelectedImageId(null);
                  setSelectedStickyId(null);
                  setSelectedFreeTextId(null);
                  setIsTextToolLocked(false);
                  setEditingFreeTextId(null);
                  setSelectedDrawingId(null);
                  setSelectedShapeId(null);
                                setCurrentPath([]);
                  setEraserPath([]);
                }}
                className={`p-2 rounded-md transition-colors ${isDrawing ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-400"}`}
                title="Draw Tool"
              ><Pencil size={18} /></button>
              <div className="h-px bg-slate-100 my-1 mx-2" />
              <button onClick={handleToolbarImageUpload} className="p-2 rounded-md transition-colors hover:bg-slate-50 text-slate-400 hover:text-emerald-600" title="Upload Image"><ImagePlus size={18} /></button>
            </div>

            {/* Mobile dock: collapsed state is only the active tool button;
                expanded state adds the surrounding scrollable toolbar shell. */}
            <div
              className={`fixed top-20 left-3 z-[11000] flex sm:hidden flex-col items-center transition-all duration-200 ease-out ${
                mobileToolbarOpen
                  ? "w-11 max-h-[calc(100dvh-7rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-xl backdrop-blur"
                  : "h-9 w-9 overflow-visible"
              }`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {!mobileToolbarOpen ? (
                <button
                  type="button"
                  aria-label="Open tools"
                  aria-expanded={false}
                  onClick={() => setMobileToolbarOpen(true)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-lg transition-colors hover:bg-slate-50"
                >
                  {isPanning
                    ? <Hand size={20} />
                    : isDrawing
                      ? <Pencil size={20} />
                      : isTextToolActive
                        ? <Type size={20} />
                        : isStickyToolActive
                          ? <StickyNote size={20} />
                          : isShapeToolActive
                            ? <ShapeToolIcon kind={activeShapeKind} size={20} />
                            : <MousePointer2 size={20} />}
                </button>
              ) : (
                <div className="flex max-h-[calc(100dvh-7.5rem)] w-full flex-col items-center gap-1 overflow-x-hidden overflow-y-auto overscroll-contain">
                  <button type="button" onClick={() => { setActiveTool("select"); setIsTextToolLocked(false); setEditingFreeTextId(null); setMobileToolbarOpen(false); }} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${activeTool === "select" ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`} title="Select"><MousePointer2 size={20}/></button>
                  <button type="button" onClick={() => { setActiveTool("pan"); setIsTextToolLocked(false); setEditingFreeTextId(null); setMobileToolbarOpen(false); }} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isPanning ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`} title="Pan"><Hand size={20}/></button>
                  <ShapeToolButton activeShapeKind={activeShapeKind} isActive={isShapeToolActive} onOpen={() => handleSelectShapeKind(activeShapeKind)} onSelectShapeKind={(kind) => { handleSelectShapeKind(kind); setMobileToolbarOpen(false); }} compact />
                  <div className="my-0.5 h-px w-6 shrink-0 bg-slate-100" />
                  <button type="button" onClick={() => { setActiveTool(activeTool === "sticky" ? "select" : "sticky"); useSelectionStore.getState().deselectAll(); setSelectedShapeId(null); setSelectedImageId(null); setSelectedDrawingId(null); setSelectedFreeTextId(null); setEditingFreeTextId(null); setEditingStickyId(null); setSelectedStickyId(null); setIsTextToolLocked(false); setMobileToolbarOpen(false); }} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isStickyToolActive ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`} title="Sticky Note"><StickyNote size={20}/></button>
                  <button type="button" onClick={() => { useSelectionStore.getState().deselectAll(); setSelectedShapeId(null); setSelectedImageId(null); setSelectedDrawingId(null); setSelectedStickyId(null); activateTextTool(false); setMobileToolbarOpen(false); }} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isTextToolActive ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`} title="Text"><Type size={20}/></button>
                  <button type="button" onClick={() => { setActiveTool(isDrawing ? "select" : drawTool); useSelectionStore.getState().deselectAll(); setSelectedImageId(null); setSelectedStickyId(null); setSelectedFreeTextId(null); setIsTextToolLocked(false); setEditingFreeTextId(null); setSelectedDrawingId(null); setSelectedShapeId(null); setCurrentPath([]); setEraserPath([]); setMobileToolbarOpen(false); }} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isDrawing ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`} title="Draw"><Pencil size={20}/></button>
                  <div className="my-0.5 h-px w-6 shrink-0 bg-slate-100" />
                  <button type="button" onClick={() => { handleToolbarImageUpload(); setMobileToolbarOpen(false); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500" title="Upload Image"><ImagePlus size={20}/></button>
                </div>
              )}
            </div>
          </>
        )}
      </TransformWrapper>
      {selectionScreenBox && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-[2147483000] rounded border-2 border-indigo-600 bg-indigo-500/15"
          style={{
            left: Math.min(selectionScreenBox.startX, selectionScreenBox.currentX),
            top: Math.min(selectionScreenBox.startY, selectionScreenBox.currentY),
            width: Math.abs(selectionScreenBox.startX - selectionScreenBox.currentX),
            height: Math.abs(selectionScreenBox.startY - selectionScreenBox.currentY),
          }}
        />
      )}
    </div>
  );
}
