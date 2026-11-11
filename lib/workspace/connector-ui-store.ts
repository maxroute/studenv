// ---------------------------------------------------------------------------
// Connector UI state — current mode and quick-connect requests
// ---------------------------------------------------------------------------

"use client";

import { create } from "zustand";
import { DEFAULT_CONNECTOR_MODE, type ConnectorMode } from "@/types/workspace";
import { readLastConnectorMode, writeLastConnectorMode } from "./connector-autocomplete";

type QuickConnectRequest = { sourceId: string; clientX: number; clientY: number };

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
}

export const useConnectorUiStore = create<ConnectorUiState>()((set) => ({
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
}));
