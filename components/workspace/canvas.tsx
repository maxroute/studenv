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
import { ShapeCreationOverlay } from "./shapes/ShapeCreationOverlay";
import { ShapeToolButton, ShapeToolIcon } from "./shapes/ShapeToolButton";
import type { ShapeKind } from "@/lib/workspace/shape-types";
import { SHAPE_KINDS } from "@/lib/workspace/shape-types";
import { useSelectionStore, isIntersecting } from "@/lib/workspace/selection-engine";
import { isMigratedToSelectionOverlay } from "@/lib/workspace/shape-engine";
import { SelectionOverlay } from "./shapes/SelectionOverlay";
import { SelectionBox } from "./shapes/ShapeInteractionLayer";
import { ShapeStyleToolbar } from "./shapes/ShapeStyleToolbar";
import { ShapeContextMenu } from "./shapes/ShapeContextMenu";
import { SnapGuidesOverlay } from "./shapes/SnapGuidesOverlay";
import { computeSnap, type SnapGuideLine } from "@/lib/workspace/snapping-engine";
import { useKeyboardShortcuts } from "@/lib/workspace/keyboard-shortcuts";

import { uploadWorkspaceAsset } from "@/lib/utils/multipart-upload";


type CanvasPoint = { x: number; y: number };
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
  const padding = Math.ceil(strokeWidth / 2) + 2;
  const minX = Math.min(...normalizedPoints.map((point) => point.x));
  const minY = Math.min(...normalizedPoints.map((point) => point.y));
  const maxX = Math.max(...normalizedPoints.map((point) => point.x));
  const maxY = Math.max(...normalizedPoints.map((point) => point.y));
  const x = minX - padding;
  const y = minY - padding;
  const localPoints = normalizedPoints.map((point) => ({
    x: point.x - x,
    y: point.y - y,
  }));

  return {
    x,
    y,
    w: Math.max(maxX - minX + padding * 2, 1),
    h: Math.max(maxY - minY + padding * 2, 1),
    d: buildStrokePath(localPoints),
    points: localPoints,
    color,
    strokeWidth,
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

  // On touch-first devices, let the active canvas tool own one-finger gestures.
  // This prevents TransformWrapper from interpreting Select drags as canvas pans.
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updatePointerMode = () => setIsCoarsePointer(mediaQuery.matches);
    updatePointerMode();
    mediaQuery.addEventListener("change", updatePointerMode);
    return () => mediaQuery.removeEventListener("change", updatePointerMode);
  }, []);

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

      const eraserSamples = resamplePolyline(path, 2);
      const radiusSquared = eraserRadius * eraserRadius;
      const nextItems = items.flatMap((item) => {
        if (item.type === "shape") {
          // Shapes are atomic vector objects: erase the whole object when the
          // eraser path intersects its rotated bounds.
          const rotation = ((item.rotation ?? 0) * Math.PI) / 180;
          const cos = Math.cos(rotation);
          const sin = Math.sin(rotation);
          const centerX = item.x + item.w / 2;
          const centerY = item.y + item.h / 2;
          const touchedShape = eraserSamples.some((point) => {
            const dx = point.x - centerX;
            const dy = point.y - centerY;
            const localX = dx * cos + dy * sin + item.w / 2;
            const localY = -dx * sin + dy * cos + item.h / 2;
            return localX >= -eraserRadius && localX <= item.w + eraserRadius &&
              localY >= -eraserRadius && localY <= item.h + eraserRadius;
          });
          return touchedShape ? [] : [item];
        }

        if (item.type !== "drawing") {
          return [item];
        }

        const localPoints = item.props.points;
        if (!localPoints || localPoints.length < 2) {
          const touchedLegacyStroke = path.some((pt) => {
            return (
              pt.x >= item.x - eraserRadius &&
              pt.x <= item.x + item.w + eraserRadius &&
              pt.y >= item.y - eraserRadius &&
              pt.y <= item.y + item.h + eraserRadius
            );
          });

          return touchedLegacyStroke ? [] : [item];
        }

        const worldPoints = resamplePolyline(
          localPoints.map((point) => ({
            x: item.x + point.x,
            y: item.y + point.y,
          })),
          2,
        );

        const keptSegments: CanvasPoint[][] = [];
        let activeSegment: CanvasPoint[] = [];
        let touched = false;

        for (const point of worldPoints) {
          const shouldErase = eraserSamples.some((eraserPoint) => {
            const dx = point.x - eraserPoint.x;
            const dy = point.y - eraserPoint.y;
            return dx * dx + dy * dy <= radiusSquared;
          });

          if (shouldErase) {
            touched = true;
            if (activeSegment.length > 1) {
              keptSegments.push(activeSegment);
            }
            activeSegment = [];
            continue;
          }

          activeSegment.push(point);
        }

        if (activeSegment.length > 1) {
          keptSegments.push(activeSegment);
        }

        if (!touched) {
          return [item];
        }

        return keptSegments
          .map((segment) => {
            const drawing = createDrawingFromWorldPoints(segment, item.props.color, item.props.strokeWidth);
            return createWorkspaceItem("drawing", drawing, {
              x: drawing.x,
              y: drawing.y,
              zIndex: item.zIndex,
            });
          })
          .filter(Boolean) as StudioItem[];
      });

      const didChange =
        nextItems.length !== items.length ||
        nextItems.some((item, index) => items[index]?.id !== item.id);

      if (didChange) {
        commitDrawingItems(nextItems);
      }
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
      e.stopPropagation();
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      setMousePos({ x, y });

      if (drawTool === "eraser") {
        setEraserPath([{ x, y }]);
      } else {
        setCurrentPath([{ x, y }]);
      }

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [drawTool, screenToWorld],
  );

  const handleDrawPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      setMousePos({ x, y });

      if (drawTool === "pen" && currentPath.length > 0) {
        setCurrentPath((prev) => [...prev, { x, y }]);
      }

      if (drawTool === "eraser" && eraserPath.length > 0) {
        setEraserPath((prev) => [...prev, { x, y }]);
      }
    },
    [currentPath.length, drawTool, eraserPath.length, screenToWorld],
  );

  const handleDrawPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();

      if (drawTool === "pen" && currentPath.length > 1) {
        const { x, y } = screenToWorld(e.clientX, e.clientY);
        const lastPoint = currentPath[currentPath.length - 1];
        const points = lastPoint && lastPoint.x === x && lastPoint.y === y ? currentPath : [...currentPath, { x, y }];
        const drawing = createDrawingFromWorldPoints(points, drawColor, drawStrokeWidth);
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

      if (drawTool === "eraser" && eraserPath.length > 0) {
        eraseAtPath(eraserPath);
        setEraserPath([]);
      }

      if (drawTool === "pen" && currentPath.length <= 1) {
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
          // Shape creation and drawing own their pointer gestures.
          // On touch-first devices, Select also owns one-finger gestures:
          // item drags move items and empty-canvas drags create selection boxes.
          // The Pan tool is the only mode that hands one-finger movement to
          // TransformWrapper. Desktop mouse behavior remains unchanged.
          disabled: isDrawing || isShapeToolActive || (isCoarsePointer && !isPanning),
          wheelPanning: true,
          allowLeftClickPan: isPanning,
          // Pan accepts gestures that begin over objects; other tools reserve drag handles.
          excluded: isPanning ? [] : ["drag-handle"],
        }}
        pinch={{ disabled: isDrawing }}
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
                onDragOver={(e: React.DragEvent) => e.preventDefault()}
                onDrop={handleDrop}
                onContextMenu={handleContextMenu}
                onPointerDownCapture={(e) => {
                  if (isPanning && e.button === 0) setIsPanDragging(true);
                  // Keep the editor mounted for the entire outside gesture.
                  // Blurring on pointer-down remounts the Rnd drag handle under
                  // the same gesture, which can interpret the press as a drag.
                  if (
                    editingFreeTextId &&
                    !(e.target instanceof Element &&
                      e.target.closest("[data-free-text-root]"))
                  ) {
                    pendingFreeTextDismissPointerRef.current = e.pointerId;
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                onPointerUpCapture={(e) => {
                  setIsPanDragging(false);
                  if (pendingFreeTextDismissPointerRef.current !== e.pointerId) {
                    return;
                  }

                  pendingFreeTextDismissPointerRef.current = null;
                  e.preventDefault();
                  e.stopPropagation();

                  // Commit only after the outside gesture is fully consumed.
                  // The textarea's onBlur also completes editing. Mark this
                  // specific completion as an outside dismissal so its callback
                  // does not re-select the text item.
                  outsideFreeTextDismissRef.current = true;
                  const activeElement = document.activeElement;
                  if (activeElement instanceof HTMLTextAreaElement) {
                    activeElement.blur();
                  }
                  outsideFreeTextDismissRef.current = false;

                  setEditingFreeTextId(null);
                  setSelectedFreeTextId(null);
                  if (!isTextToolLocked) {
                    setIsTextToolActive(false);
                  }
                }}
                onPointerCancelCapture={(e) => {
                  setIsPanDragging(false);
                  if (pendingFreeTextDismissPointerRef.current === e.pointerId) {
                    pendingFreeTextDismissPointerRef.current = null;
                  }
                }}
                onPointerDown={(e) => {
                  setContextMenu(null);
                  if (isDrawing) return;

                  // Start marquee selection on any non-interactive empty-canvas
                  // surface, not only when the exact canvas div is the target.
                  // Real workspace items and controls keep ownership of their
                  // own pointer gestures.
                  const target = e.target;
                  if (
                    target instanceof Element &&
                    target.closest(
                      '[data-workspace-item="true"], button, input, textarea, select, [contenteditable="true"], [role="button"], [data-no-marquee]'
                    )
                  ) {
                    return;
                  }

                  if (editingStickyId) {
                    const activeElement = document.activeElement;

                    if (activeElement instanceof HTMLTextAreaElement) {
                      activeElement.blur();
                    } else {
                      setEditingStickyId(null);
                    }

                    // Exit editing and deselect the sticky note in the same click.
                    setSelectedStickyId(null);
                    return;
                  }

                  if (isStickyToolActive) {
                    const { x, y } = screenToWorld(e.clientX, e.clientY);
                    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                      ? `item-${crypto.randomUUID()}`
                      : `item-${Math.random().toString(36).slice(2, 11)}`;
                    const note = createWorkspaceItem("sticky", { text: "", color: stickyColor, w: 220, h: 220, rotation: 0 }, {
                      id, x, y,
                      zIndex: items.length > 0 ? Math.max(...items.map((item) => item.zIndex)) + 1 : 1,
                    });
                    if (note) updateItems([...items, note]);
                    setSelectedStickyId(id);
                    setEditingStickyId(id);
                    setActiveTool("select");
                    return;
                  }

                  if (isTextToolActive || isShapeToolActive || isPanning) {
                    return;
                  }

                  setSelectedStickyId(null);
                  setEditingStickyId(null);
                  setSelectedFreeTextId(null);
                  setSelectedDrawingId(null);
                  setSelectedImageId(null);

                  // Selection box start
                  useSelectionStore.getState().deselectAll();
                  const { x, y } = screenToWorld(e.clientX, e.clientY);
                  setSelectionBox({
                    startX: x,
                    startY: y,
                    currentX: x,
                    currentY: y,
                  });
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (selectionBox) {
                    e.stopPropagation();
                    const { x, y } = screenToWorld(e.clientX, e.clientY);
                    setSelectionBox((prev) => (prev ? { ...prev, currentX: x, currentY: y } : null));

                    const rectX = Math.min(selectionBox.startX, x);
                    const rectY = Math.min(selectionBox.startY, y);
                    const rectW = Math.abs(selectionBox.startX - x);
                    const rectH = Math.abs(selectionBox.startY - y);

                    const collidingIds = items
                      .filter((item) => {
                        const bounds = { x: item.x, y: item.y, w: item.w, h: item.h };
                        const rect = { x: rectX, y: rectY, w: rectW, h: rectH };
                        return isIntersecting(bounds, rect);
                      })
                      .map((item) => item.id);

                    useSelectionStore.getState().clearAndSelectIds(collidingIds);
                  }
                }}
                onPointerUp={(e) => {
                  if (selectionBox) {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                    setSelectionBox(null);
                  }
                }}
                onDoubleClick={(e) => {
                  if (e.target === e.currentTarget && !isDrawing) {
                    const { x, y } = screenToWorld(e.clientX, e.clientY);
                    addItem("text", { text: "" }, { x, y });
                  }
                }}
                style={{
                  backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)",
                  backgroundSize: "40px 40px",
                  touchAction: "none",
                }}
              >
                {selectionBox && (
                  <SelectionBox
                    x={Math.min(selectionBox.startX, selectionBox.currentX)}
                    y={Math.min(selectionBox.startY, selectionBox.currentY)}
                    w={Math.abs(selectionBox.startX - selectionBox.currentX)}
                    h={Math.abs(selectionBox.startY - selectionBox.currentY)}
                  />
                )}

                {isDrawing && (
                  <div
                    className="absolute inset-0 z-[10000]"
                    onPointerDown={handleDrawPointerDown}
                    onPointerMove={handleDrawPointerMove}
                    onPointerUp={handleDrawPointerUp}
                    onPointerCancel={(e) => {
                      if (e.currentTarget) {
                        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                      }
                      setCurrentPath([]);
                      setEraserPath([]);
                    }}
                    style={{ cursor: drawTool === "eraser" ? "none" : "crosshair" }}
                  />
                )}

                {isTextToolActive && !isDrawing && !editingFreeTextId && (
                  <div
                    className="absolute inset-0 z-[0]"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    onPointerUp={handleTextPointerUp}
                    style={{ cursor: "text" }}
                  />
                )}

                {isShapeToolActive && (
                  <ShapeCreationOverlay
                    activeShapeKind={activeShapeKind}
                    screenToWorld={screenToWorld}
                    onComplete={() => {
                      setIsShapeToolActive(false);
                    }}
                  />
                )}

                {currentPath.length > 1 && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-[999]">
                    <path
                      d={buildStrokePath(currentPath)}
                      stroke={drawColor}
                      strokeWidth={drawStrokeWidth}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
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
                          ? editingStickyId === item.id
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
                          handleFreeTextSelect(item.id);
                        }}
                        onStartEditing={() => {
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
    </div>
  );
}
