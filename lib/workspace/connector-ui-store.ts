// ---------------------------------------------------------------------------
// Connector UI state — current mode and quick-connect requests
// ---------------------------------------------------------------------------

"use client";

import { create } from "zustand";
import { DEFAULT_CONNECTOR_MODE, type ConnectorMode } from "@/types/workspace";
import { readLastConnectorMode, writeLastConnectorMode } from "./connector-autocomplete";
import { readLastConnectorStyle, writeLastConnectorStyle, type ConnectorStyle } from "./connector-style";

type QuickConnectRequest = { sourceId: string; clientX: number; clientY: number };

/** Which part of a connector was pressed. */
export type ConnectorPart = "path" | "label";
type ConnectorPointerHandler = (connectorId: string, event: PointerEvent, part: ConnectorPart) => void;
type ConnectorDoubleClickHandler = (connectorId: string, event: MouseEvent) => void;
/** Label being edited: the connector and where along its path (0..1). */
export type LabelEditing = { connectorId: string; offset: number };

interface ConnectorUiState {
  /** Mode for newly created connectors; remembered as the last-used mode. */
  mode: ConnectorMode;
  setMode: (mode: ConnectorMode) => void;
  /** Set by the element toolbar's "Draw connector" button. */
  quickConnect: QuickConnectRequest | null;
  requestQuickConnect: (request: QuickConnectRequest) => void;
  clearQuickConnect: () => void;
  /** True while any connector gesture is in progress (toolbars hide, like AFFiNE). */
  gestureActive: boolean;
  setGestureActive: (active: boolean) => void;
  /**
   * Set by the connector editing layer; the connectors layer calls it when a
   * connector path or label is pressed in Select mode.
   */
  connectorPointerDown: ConnectorPointerHandler | null;
  setConnectorPointerDown: (handler: ConnectorPointerHandler | null) => void;
  /** Double-click on a connector path or label opens its label editor. */
  connectorDoubleClick: ConnectorDoubleClickHandler | null;
  setConnectorDoubleClick: (handler: ConnectorDoubleClickHandler | null) => void;
  /** Style for newly created connectors; remembered as the last-used style. */
  style: ConnectorStyle;
  rememberStyle: (style: Partial<ConnectorStyle>) => void;
  editingLabel: LabelEditing | null;
  setEditingLabel: (editing: LabelEditing | null) => void;
}

export const useConnectorUiStore = create<ConnectorUiState>()((set, get) => ({
  mode: readLastConnectorMode(DEFAULT_CONNECTOR_MODE),
  setMode: (mode) => {
    writeLastConnectorMode(mode);
    set({ mode });
  },
  quickConnect: null,
  requestQuickConnect: (request) => set({ quickConnect: request }),
  clearQuickConnect: () => set({ quickConnect: null }),
  gestureActive: false,
  setGestureActive: (gestureActive) => set({ gestureActive }),
  connectorPointerDown: null,
  setConnectorPointerDown: (connectorPointerDown) => set({ connectorPointerDown }),
  connectorDoubleClick: null,
  setConnectorDoubleClick: (connectorDoubleClick) => set({ connectorDoubleClick }),
  style: readLastConnectorStyle(),
  rememberStyle: (changes) => {
    const style = { ...get().style, ...changes };
    writeLastConnectorStyle(style);
    set({ style });
  },
  editingLabel: null,
  setEditingLabel: (editingLabel) => set({ editingLabel }),
}));
