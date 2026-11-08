"use client";

import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useViewerStore } from "@/hooks/use-viewer-store";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hand,
  ImagePlus,
  StickyNote,
  Link2,
  Lock,
  Maximize2,
  Minus,
  MousePointer2,
  MoreHorizontal,
  ChevronRight,
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
import { ConnectionsLayer } from "./ConnectionsLayer";
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
import { ShapeToolButton } from "./shapes/ShapeToolButton";
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
  | "connect"
  | ShapeKind;

interface StudioCanvasProps {
  workspaceId: string;
}

export function TldrawCanvas({ workspaceId: _workspaceId }: StudioCanvasProps) {
  const { items, viewport, workspaceAssetIds, isLoading, addItem, updateItem, updateItems, updateViewport, syncWithServer, addConnection, registerWorkspaceAsset } =
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
  const isConnecting = activeTool === "connect";
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

  const setIsConnecting = useCallback((val: boolean) => {
    if (val) {
      setActiveTool("connect");
    } else {
      setActiveTool((prev) => (prev === "connect" ? "select" : prev));
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
    setConnectingFromId(null);
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
    setIsTextToolLocked(false);
    setSelectedFreeTextId(null);
    setEditingFreeTextId(null);
    setSelectedDrawingId(null);
    setSelectedImageId(null);
    setSelectedShapeId(null);
    setConnectingFromId(null);
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

  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
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
    if (isLoading || items.length === 0 || hasAppliedInitialFitRef.current) return;
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
  }, [items, isLoading, viewport.x, viewport.y, viewport.zoom, fitWorkspaceToViewport]);

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
    setSelectedFreeTextId(itemId);
    setEditingFreeTextId(null);
  }, []);

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
          disabled: isDrawing,
          wheelPanning: true,
          allowLeftClickPan: isPanning,
          // A text item's drag handle owns single-touch gestures. This keeps
          // the canvas from starting a pan before the text can select/edit/move.
          excluded: ["drag-handle"],
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
                onDragOver={(e: React.DragEvent) => e.preventDefault()}
                onDrop={handleDrop}
                onContextMenu={handleContextMenu}
                onPointerDownCapture={(e) => {
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
                  if (pendingFreeTextDismissPointerRef.current === e.pointerId) {
                    pendingFreeTextDismissPointerRef.current = null;
                  }
                }}
                onPointerDown={(e) => {
                  setContextMenu(null);
                  if (e.target !== e.currentTarget || isDrawing || isConnecting) {
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

                <ConnectionsLayer />

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

                {isConnecting && connectingFromId && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-[999]">
                    <line
                      x1={items.find((item) => item.id === connectingFromId)!.x + items.find((item) => item.id === connectingFromId)!.w / 2}
                      y1={items.find((item) => item.id === connectingFromId)!.y + items.find((item) => item.id === connectingFromId)!.h / 2}
                      x2={mousePos.x}
                      y2={mousePos.y}
                      stroke="#6366f1"
                      strokeWidth="2"
                      strokeDasharray="5,5"
                    />
                  </svg>
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
                    isConnecting={isConnecting}
                    // Sticky notes own their text input; other tools must never disable their pointer events.
                    isDrawingMode={item.type === "sticky" ? false : isDrawing || (isTextToolActive && !editingFreeTextId) || isShapeToolActive}
                    canvasScale={viewport.zoom}
                    onPointerEnter={() => {
                      if (!isDrawing && !isConnecting && !isShapeToolActive && !isTextToolActive) {
                        setHoveredItemId(item.id);
                      }
                    }}
                    onPointerLeave={() => {
                      setHoveredItemId((prev) => (prev === item.id ? null : prev));
                    }}
                    disableDragging={
                      item.type === "sticky"
                        ? editingStickyId === item.id
                        : item.type === "free-text"
                          ? editingFreeTextId === item.id || selectedFreeTextId !== item.id
                          : item.type === "drawing"
                            ? false
                            : isMigratedToSelectionOverlay(item.type)
                              ? ('locked' in item.props && item.props.locked) || !selectedIds.includes(item.id)
                              : undefined
                    }
                    enableResizing={
                      item.type === "sticky" || item.type === "free-text" || item.type === "drawing" || isMigratedToSelectionOverlay(item.type)
                        ? false
                        : undefined
                    }
                    showConnectionHandle={item.type !== "sticky" && item.type !== "free-text" && item.type !== "drawing" && !isMigratedToSelectionOverlay(item.type)}
                    showDeleteButton={
                      item.type === "sticky"
                        ? selectedStickyId === item.id
                        : item.type === "free-text"
                          ? selectedFreeTextId === item.id
                          : item.type === "drawing"
                            ? selectedDrawingId === item.id
                            : item.type === "image"
                              ? selectedImageId === item.id
                              : isMigratedToSelectionOverlay(item.type)
                                ? selectedIds.includes(item.id)
                                : true
                    }
                    passThrough={item.type === "drawing"}
                    showRotateButton={
                      (item.type === "drawing" && selectedDrawingId === item.id) ||
                      (item.type === "image" && selectedImageId === item.id) ||
                      (isMigratedToSelectionOverlay(item.type) && selectedIds.includes(item.id) && !('locked' in item.props && item.props.locked))
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
                      if (item.type === "sticky") {
                        // Sticky-note editing is self-contained and must not inherit Text tool state.
                        setActiveTool("select");
                        setIsTextToolLocked(false);
                        setSelectedFreeTextId(null);
                        setEditingFreeTextId(null);
                        setSelectedDrawingId(null);
                        setSelectedImageId(null);
                        setSelectedShapeId(null);
                        useSelectionStore.getState().deselectAll();

                        if (selectedStickyId === item.id) {
                          setEditingStickyId(item.id);
                        } else {
                          setSelectedStickyId(item.id);
                          setEditingStickyId(null);
                        }
                        return;
                      }
                      const { select, toggle, selectedIds: selIds } = useSelectionStore.getState();

                      const targetIds = [item.id];
                      if (item.props && (item.props as any).groupId) {
                        const gId = (item.props as any).groupId;
                        const groupMembers = items.filter(i => i.props && (i.props as any).groupId === gId).map(i => i.id);
                        if (groupMembers.length > 0) {
                          targetIds.push(...groupMembers.filter(id => id !== item.id));
                        }
                      }

                      if (item.type === "free-text") {
                        setSelectedStickyId(null);
                        setEditingStickyId(null);
                        setSelectedDrawingId(null);
                        setSelectedImageId(null);
                        setSelectedShapeId(null);
                        useSelectionStore.getState().deselectAll();
                        handleFreeTextSelect(item.id);
                      } else if (item.type === "drawing") {
                        setSelectedStickyId(null);
                        setEditingStickyId(null);
                        setSelectedFreeTextId(null);
                        setEditingFreeTextId(null);
                        setIsTextToolActive(false);
                        setSelectedImageId(null);
                        setSelectedShapeId(null);
                        useSelectionStore.getState().deselectAll();
                        setSelectedDrawingId(item.id);
                      } else if (item.type === "shape" || item.type === "text" || item.type === "image") {
                        setSelectedStickyId(null);
                        setEditingStickyId(null);
                        setSelectedFreeTextId(null);
                        setEditingFreeTextId(null);
                        setIsTextToolActive(false);
                        setSelectedDrawingId(null);
                        setSelectedImageId(null);
                        if (event?.shiftKey) {
                          const isSomeSelected = targetIds.some(id => selIds.includes(id));
                          if (isSomeSelected) {
                            useSelectionStore.getState().clearAndSelectIds(selIds.filter(id => !targetIds.includes(id)));
                          } else {
                            useSelectionStore.getState().selectIds(targetIds);
                          }
                        } else {
                          useSelectionStore.getState().clearAndSelectIds(targetIds);
                        }
                      }
                    }}
                    onClick={() => {
                      if (!isConnecting) return;
                      if (!connectingFromId) {
                        setConnectingFromId(item.id);
                        toast.success("Select target node to connect");
                        return;
                      }
                      if (connectingFromId !== item.id) {
                        addConnection(connectingFromId, item.id);
                        setConnectingFromId(null);
                        setIsConnecting(false);
                        toast.success("Nodes connected!");
                      }
                    }}
                    className={
                      connectingFromId === item.id
                        ? "ring-4 ring-indigo-500 rounded-lg"
                        : item.type === "drawing" && selectedDrawingId === item.id
                          ? "rounded-md ring-2 ring-slate-500/60"
                          : isMigratedToSelectionOverlay(item.type)
                            ? ""
                            : item.type === "free-text" && (selectedFreeTextId === item.id || editingFreeTextId === item.id)
                              ? "rounded-md ring-2 ring-indigo-400/70"
                              : ""
                    }
                  >
                    {item.type === "pdf-fragment" && <PdfFragment item={item} />}
                    {item.type === "video-anchor" && <VideoAnchor item={item} />}
                    {item.type === "text" && <TextNode item={item as any} />}
                    {item.type === "sticky" && (
                      <StickyNode
                        item={item as any}
                        isSelected={selectedStickyId === item.id}
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
                        isSelected={selectedFreeTextId === item.id}
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
                        isSelected={selectedDrawingId === item.id}
                        onSelect={() => {
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

                {/* Bounding handles selection overlay */}
                <SelectionOverlay
                  canvasScale={viewport.zoom}
                  screenToWorld={screenToWorld}
                  hoveredItemId={hoveredItemId}
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

            {(isTextToolActive || !!selectedFreeTextId || !!editingFreeTextId) && (
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
                  setSelectedDrawingId(null);
                  setSelectedShapeId(null);
                }}
                className={`p-2 rounded-md transition-colors ${activeTool === "select" ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-400"}`}
                title="Select Mode"
              ><MousePointer2 size={18} /></button>
              <button
                onClick={() => {
                  setActiveTool("pan");
                  setIsTextToolLocked(false);
                  setEditingFreeTextId(null);
                  setSelectedDrawingId(null);
                  setSelectedShapeId(null);
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
                  setEditingStickyId(null);
                  setSelectedStickyId(null);
                  setIsTextToolLocked(false);
                }}
                className={`p-2 rounded-md transition-colors ${isStickyToolActive ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-400"}`}
                title="Sticky Note — click the canvas to place"
              ><StickyNote size={18} /></button>
              <button
                onClick={() => activateTextTool(false)}
                onDoubleClick={() => activateTextTool(true)}
                className={`relative p-2 rounded-md transition-colors ${isTextToolActive ? (isTextToolLocked ? "bg-amber-100 text-amber-700 ring-2 ring-amber-500/50" : "bg-indigo-50 text-indigo-600") : "hover:bg-slate-50 text-slate-400"}`}
                title="Text Tool (T) - Double-click to lock"
              >
                <Type size={18} />
                {isTextToolLocked && <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white shadow-sm ring-1 ring-white"><Lock size={8} strokeWidth={3} /></span>}
              </button>
              <button
                onClick={() => {
                  setActiveTool(isConnecting ? "select" : "connect");
                  setConnectingFromId(null);
                  setIsTextToolLocked(false);
                  setEditingFreeTextId(null);
                  setSelectedDrawingId(null);
                }}
                className={`p-2 rounded-md transition-colors ${isConnecting ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-400"}`}
                title="Connect Nodes"
              ><Link2 size={18} /></button>
              <button
                onClick={() => {
                  setActiveTool(isDrawing ? "select" : drawTool);
                  setIsTextToolLocked(false);
                  setEditingFreeTextId(null);
                  setSelectedDrawingId(null);
                  setSelectedShapeId(null);
                  setConnectingFromId(null);
                  setCurrentPath([]);
                  setEraserPath([]);
                }}
                className={`p-2 rounded-md transition-colors ${isDrawing ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-50 text-slate-400"}`}
                title="Draw Tool"
              ><Pencil size={18} /></button>
              <div className="h-px bg-slate-100 my-1 mx-2" />
              <button onClick={handleToolbarImageUpload} className="p-2 rounded-md transition-colors hover:bg-slate-50 text-slate-400 hover:text-emerald-600" title="Upload Image"><ImagePlus size={18} /></button>
            </div>

            {/* Mobile: compact left-side launcher with primary tools and a secondary More group */}
            <div className="fixed top-20 left-3 z-[11000] flex sm:hidden flex-col items-start gap-2">
              <button
                type="button"
                aria-label={mobileToolbarOpen ? "Close tools" : "Open tools"}
                aria-expanded={mobileToolbarOpen}
                onClick={() => {
                  setMobileToolbarOpen((open) => !open);
                  setMobileMoreOpen(false);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-lg backdrop-blur"
              >
                {isPanning ? <Hand size={19} /> : isDrawing ? <Pencil size={19} /> : isTextToolActive ? <Type size={19} /> : isStickyToolActive ? <StickyNote size={19} /> : isConnecting ? <Link2 size={19} /> : isShapeToolActive ? <Maximize2 size={19} /> : <MousePointer2 size={19} />}
                <span className={`absolute ml-7 mt-7 h-2 w-2 rounded-full border border-white ${activeTool === "select" ? "bg-indigo-500" : "bg-amber-500"}`} />
              </button>

              {mobileToolbarOpen && (
                <div className="flex max-h-[calc(100dvh-7rem)] flex-col gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur">
                  <button type="button" onClick={() => { setActiveTool("select"); setIsTextToolLocked(false); setEditingFreeTextId(null); setSelectedDrawingId(null); setSelectedShapeId(null); setMobileToolbarOpen(false); }} className={`rounded-lg p-2.5 ${activeTool === "select" ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`} title="Select"><MousePointer2 size={20}/></button>
                  <button type="button" onClick={() => { setActiveTool("pan"); setIsTextToolLocked(false); setEditingFreeTextId(null); setSelectedDrawingId(null); setSelectedShapeId(null); setMobileToolbarOpen(false); }} className={`rounded-lg p-2.5 ${isPanning ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`} title="Pan"><Hand size={20}/></button>
                  <ShapeToolButton activeShapeKind={activeShapeKind} isActive={isShapeToolActive} onSelectShapeKind={(kind) => { handleSelectShapeKind(kind); setMobileToolbarOpen(false); }} />
                  <button type="button" onClick={() => { activateTextTool(false); setMobileToolbarOpen(false); }} className={`relative rounded-lg p-2.5 ${isTextToolActive ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`} title="Text"><Type size={20}/></button>
                  <button type="button" onClick={() => { setActiveTool(isDrawing ? "select" : drawTool); setIsTextToolLocked(false); setEditingFreeTextId(null); setSelectedDrawingId(null); setSelectedShapeId(null); setConnectingFromId(null); setCurrentPath([]); setEraserPath([]); setMobileToolbarOpen(false); }} className={`rounded-lg p-2.5 ${isDrawing ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`} title="Draw"><Pencil size={20}/></button>
                  <div className="mx-1 h-px bg-slate-100" />
                  <button type="button" onClick={() => setMobileMoreOpen((open) => !open)} className={`flex items-center justify-center gap-1 rounded-lg p-2.5 text-slate-500 ${mobileMoreOpen ? "bg-slate-100" : ""}`} title="More tools"><MoreHorizontal size={20}/><ChevronRight size={12} className={mobileMoreOpen ? "rotate-90" : ""}/></button>
                  {mobileMoreOpen && (
                    <div className="mt-1 flex flex-col gap-1 border-t border-slate-100 pt-1">
                      <button type="button" onClick={() => { setActiveTool(activeTool === "sticky" ? "select" : "sticky"); setEditingStickyId(null); setSelectedStickyId(null); setIsTextToolLocked(false); setMobileToolbarOpen(false); setMobileMoreOpen(false); }} className={`rounded-lg p-2.5 ${isStickyToolActive ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`} title="Sticky note"><StickyNote size={20}/></button>
                      <button type="button" onClick={() => { setActiveTool(isConnecting ? "select" : "connect"); setConnectingFromId(null); setIsTextToolLocked(false); setEditingFreeTextId(null); setSelectedDrawingId(null); setMobileToolbarOpen(false); setMobileMoreOpen(false); }} className={`rounded-lg p-2.5 ${isConnecting ? "bg-indigo-50 text-indigo-600" : "text-slate-500"}`} title="Connect"><Link2 size={20}/></button>
                      <button type="button" onClick={() => { handleToolbarImageUpload(); setMobileToolbarOpen(false); setMobileMoreOpen(false); }} className="rounded-lg p-2.5 text-slate-500" title="Upload image"><ImagePlus size={20}/></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
