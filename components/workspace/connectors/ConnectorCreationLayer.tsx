"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ConnectorEnd, StudioItem } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { useConnectorUiStore } from "@/lib/workspace/connector-ui-store";
import { isConnectableWorkspaceItem } from "@/lib/workspace/connector-geometry";
import { getNearestConnectorAnchorTo, type Vec } from "@/lib/workspace/connector-anchors";
import { findConnectionTarget } from "@/lib/workspace/connector-target";
import { computeConnectorRoute } from "@/lib/workspace/connector-routing";
import { getEffectiveRotation } from "@/lib/workspace/selection-frame";
import { getShapePath } from "@/lib/workspace/shape-paths";
import {
  AUTO_COMPLETE_DRAG_THRESHOLD,
  AUTO_COMPLETE_MAIN_GAP,
  getAutoCompletePositions,
  getConnectedBounds,
  getDropTargetPlacement,
  getNextAutoCompleteBound,
  type AutoCompleteDirection,
} from "@/lib/workspace/connector-autocomplete";
import { useConnectionGesture } from "./useConnectionGesture";
import { ConnectorDraftPreview } from "./ConnectorDraftPreview";
import { ConnectorAutoCompleteArrows, type AutoCompleteSource } from "./ConnectorAutoCompleteArrows";
import { ConnectorDropPanel, type DropPanelChoice } from "./ConnectorDropPanel";

type PanelState = { connectorId: string; sourceId: string; client: Vec };

const DEFAULT_SHAPE_SIZE = { w: 120, h: 120 };
const STICKY_SIZE = { w: 220, h: 220 };
const FREE_TEXT_SIZE = { w: 220, h: 64 };
/** Covers negative world coordinates too; the world layer itself starts at 0,0. */
const TOOL_OVERLAY_EXTENT = 100000;

function cloneProps<T>(props: T): T {
  return JSON.parse(JSON.stringify(props)) as T;
}

/**
 * Every way to create a connector (AFFiNE parity): auto-complete arrows on a
 * selected shape/sticky, the connector tool (toolbar + `C`), and quick
 * connect from the shape toolbar. Rendered inside the canvas world layer.
 */
export function ConnectorCreationLayer({
  items,
  selectedIds,
  activeTool,
  zoom,
  screenToWorld,
  onToolDone,
}: {
  items: StudioItem[];
  selectedIds: string[];
  /** "select" shows auto-complete arrows; "connector" activates the tool. */
  activeTool: string;
  zoom: number;
  screenToWorld: (clientX: number, clientY: number) => Vec;
  /** Called after the connector tool creates a connector (returns to Select, like AFFiNE). */
  onToolDone: () => void;
}) {
  const addItem = useWorkspaceStore((state) => state.addItem);
  const batchUpdateItems = useWorkspaceStore((state) => state.batchUpdateItems);
  const select = useSelectionStore((state) => state.select);
  const deselectAll = useSelectionStore((state) => state.deselectAll);
  const draggingIds = useSelectionStore((state) => state.draggingIds);
  const rotationPreviews = useSelectionStore((state) => state.rotationPreviews);
  const mode = useConnectorUiStore((state) => state.mode);
  const quickConnect = useConnectorUiStore((state) => state.quickConnect);
  const clearQuickConnect = useConnectorUiStore((state) => state.clearQuickConnect);
  const gesture = useConnectionGesture({ items, zoom, screenToWorld });
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [panelHover, setPanelHover] = useState<DropPanelChoice | null>(null);

  const createConnector = useCallback((source: ConnectorEnd, target: ConnectorEnd) => {
    // New connectors take the last-used mode and style (AFFiNE last props).
    const { mode: lastMode, style } = useConnectorUiStore.getState();
    return addItem("connector", { ...style, source, target, mode: lastMode }, { x: 0, y: 0 });
  },
  [addItem]);

  // ── auto-complete arrows ────────────────────────────────────────────────
  const autoCompleteSource = useMemo<AutoCompleteSource | null>(() => {
    if (activeTool !== "select" || selectedIds.length !== 1) return null;
    const item = items.find((candidate) => candidate.id === selectedIds[0]);
    if (!item || !isConnectableWorkspaceItem(item)) return null;
    return item.type === "shape" || item.type === "sticky" ? item : null;
  }, [activeTool, items, selectedIds]);

  const createNextObject = useCallback((source: AutoCompleteSource, direction: AutoCompleteDirection) => {
    if (source.type === "shape") {
      const bound = getNextAutoCompleteBound(direction, source, getConnectedBounds(source.id, items));
      const id = addItem("shape", { ...cloneProps(source.props), locked: false, w: bound.w, h: bound.h, rotation: source.rotation }, { x: bound.x, y: bound.y });
      if (!id) return;
      const { start, end } = getAutoCompletePositions(direction);
      createConnector({ id: source.id, position: start }, { id, position: end });
      select(id);
      return;
    }
    // Notes/stickies: a new note beside the source, no connector (AFFiNE).
    const dx = direction === "left" ? -(source.w + AUTO_COMPLETE_MAIN_GAP) : source.w + AUTO_COMPLETE_MAIN_GAP;
    const id = addItem("sticky", { text: "", color: source.props.color, w: source.w, h: source.h }, { x: source.x + dx, y: source.y });
    if (id) select(id);
  }, [addItem, createConnector, items, select]);

  const handleArrowPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>, direction: AutoCompleteDirection) => {
    const source = autoCompleteSource;
    if (!source || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners still track the gesture.
    }
    const { start } = getAutoCompletePositions(direction);
    gesture.start({
      kind: "drag",
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      threshold: AUTO_COMPLETE_DRAG_THRESHOLD,
      resolveSource: () => ({ end: { id: source.id, position: start }, id: source.id }),
      onClick: () => createNextObject(source, direction),
      onCommit: (draft) => {
        const id = createConnector(draft.source, draft.target.end);
        if (!draft.target.targetId && id) {
          // Released on empty canvas: keep the free-ended connector and offer
          // objects to create there.
          deselectAll();
          setPanel({ connectorId: id, sourceId: source.id, client: draft.client });
        }
      },
    });
  }, [autoCompleteSource, createConnector, createNextObject, deselectAll, gesture]);

  // ── connector tool ─────────────────────────────────────────────────────
  const handleToolPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners still track the gesture.
    }
    const start = findConnectionTarget(screenToWorld(event.clientX, event.clientY), items, { zoom });
    gesture.start({
      kind: "drag",
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      threshold: 0,
      resolveSource: () => ({ end: start.end, id: start.targetId }),
      onCommit: (draft) => {
        const id = createConnector(draft.source, draft.target.end);
        // AFFiNE: the tool returns to Select with the new connector selected.
        onToolDone();
        if (id) select(id);
      },
    });
  }, [createConnector, gesture, items, onToolDone, screenToWorld, select, zoom]);

  // ── quick connect (shape toolbar button) ───────────────────────────────
  useEffect(() => {
    if (!quickConnect) return;
    clearQuickConnect();
    const source = items.find((item) => item.id === quickConnect.sourceId);
    if (!source || !isConnectableWorkspaceItem(source)) return;
    gesture.start({
      kind: "quick",
      clientX: quickConnect.clientX,
      clientY: quickConnect.clientY,
      // The source side follows the pointer (AFFiNE `calculateNearestLocation`).
      resolveSource: (pointer) => ({ end: { id: source.id, position: [...getNearestConnectorAnchorTo(source, pointer).position] }, id: source.id }),
      onCommit: (draft) => {
        // A click away from any element cancels quick connect.
        if (draft.target.targetId) createConnector(draft.source, draft.target.end);
      },
    });
  }, [clearQuickConnect, createConnector, gesture, items, quickConnect]);

  // ── drop panel ─────────────────────────────────────────────────────────
  const panelPlacement = useCallback((choice: DropPanelChoice) => {
    if (!panel) return null;
    const connector = items.find((item) => item.id === panel.connectorId);
    const source = items.find((item) => item.id === panel.sourceId);
    if (!connector || connector.type !== "connector") return null;
    const route = computeConnectorRoute({ mode: connector.props.mode, source: connector.props.source, target: connector.props.target }, items);
    if (!route) return null;
    const end = route.points[route.points.length - 1];
    const beforeEnd = route.mode === "curve" ? route.controls[1] : route.points[route.points.length - 2];
    const sourceShape = source?.type === "shape" ? source : null;
    const size = choice.kind === "sticky" ? STICKY_SIZE
      : choice.kind === "free-text" ? FREE_TEXT_SIZE
      : choice.kind === "same" ? (source ? { w: source.w, h: source.h } : DEFAULT_SHAPE_SIZE)
      : sourceShape ? { w: sourceShape.w, h: sourceShape.h } : DEFAULT_SHAPE_SIZE;
    return { connector, source, ...getDropTargetPlacement(beforeEnd, end, size) };
  }, [items, panel]);

  const chooseFromPanel = useCallback((choice: DropPanelChoice) => {
    const placement = panelPlacement(choice);
    setPanel(null);
    setPanelHover(null);
    if (!placement) return;
    const { connector, source, bound, position } = placement;
    const at = { x: bound.x, y: bound.y };
    let id: string | undefined;
    if (choice.kind === "shape") {
      const base = source?.type === "shape" ? cloneProps(source.props) : {};
      id = addItem("shape", { ...base, kind: choice.shape, locked: false, w: bound.w, h: bound.h }, at);
    } else if (choice.kind === "sticky") {
      id = addItem("sticky", { text: "", w: bound.w, h: bound.h }, at);
    } else if (choice.kind === "free-text") {
      id = addItem("free-text", { text: "", w: bound.w, h: bound.h }, at);
    } else if (source && source.type !== "connector") {
      id = addItem(source.type, { ...cloneProps(source.props), locked: false, w: bound.w, h: bound.h }, at);
    }
    if (!id) return;
    batchUpdateItems([{ id: connector.id, changes: {}, props: { target: { id, position } } }]);
    select(id);
  }, [addItem, batchUpdateItems, panelPlacement, select]);

  const hoverGhost = panelHover ? panelPlacement(panelHover) : null;
  const ghostKind = panelHover?.kind === "shape" ? panelHover.shape
    : panelHover?.kind === "same" && hoverGhost?.source?.type === "shape" ? hoverGhost.source.props.kind
    : "rectangle";
  const scale = 1 / Math.max(zoom, 0.01);

  const showArrows = autoCompleteSource && !gesture.draft && draggingIds.length === 0 && !panel;

  return (
    <>
      {activeTool === "connector" && (
        <div
          aria-label="Connector tool"
          data-connector-tool-overlay="true"
          className="absolute cursor-crosshair"
          style={{ left: -TOOL_OVERLAY_EXTENT / 2, top: -TOOL_OVERLAY_EXTENT / 2, width: TOOL_OVERLAY_EXTENT, height: TOOL_OVERLAY_EXTENT, zIndex: 10000, touchAction: "none" }}
          onPointerDown={handleToolPointerDown}
        />
      )}
      {showArrows && (
        <ConnectorAutoCompleteArrows
          source={autoCompleteSource}
          rotation={getEffectiveRotation(autoCompleteSource, rotationPreviews)}
          items={items}
          zoom={zoom}
          onArrowPointerDown={handleArrowPointerDown}
        />
      )}
      {gesture.draft && <ConnectorDraftPreview draft={gesture.draft} items={items} mode={mode} zoom={zoom} />}
      {hoverGhost && (
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ zIndex: 1150 }}>
          <path
            d={getShapePath(ghostKind, hoverGhost.bound.w, hoverGhost.bound.h)}
            transform={`translate(${hoverGhost.bound.x} ${hoverGhost.bound.y})`}
            fill="none"
            stroke="#1e96eb"
            strokeWidth={1.5 * scale}
            strokeDasharray={`${4 * scale} ${4 * scale}`}
          />
        </svg>
      )}
      {panel && (
        <ConnectorDropPanel
          clientX={panel.client.x}
          clientY={panel.client.y}
          onHover={setPanelHover}
          onChoose={chooseFromPanel}
          onClose={() => {
            setPanel(null);
            setPanelHover(null);
          }}
        />
      )}
    </>
  );
}
