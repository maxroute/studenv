import { create } from "zustand";
import {
  DEFAULT_WORKSPACE_VIEWPORT,
  StudioItem,
  StudioItemType,
  WorkspaceViewport,
  createWorkspaceItem,
  parseWorkspaceSceneJson,
  serializeWorkspaceScene,
  Connection,
} from "@/types/workspace";

type StudioItemUpdate = Partial<
  Pick<StudioItem, "x" | "y" | "w" | "h" | "rotation" | "zIndex">
>;

interface WorkspaceState {
  workspaceId: string | null;
  title: string;
  coverAssetId: string | null;
  workspaceAssetIds: string[];
  items: StudioItem[];
  connections: Connection[];
  viewport: WorkspaceViewport;
  version: number;
  isLoading: boolean;
  error: string | null;

  // Save state tracking
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: number | null;

  loadWorkspace: (id: string) => Promise<void>;
  hydrateWorkspace: (payload: {
    id: string;
    title: string;
    coverAssetId?: string | null;
    sceneJson: string | null;
    version?: number;
  }) => void;
  registerWorkspaceAsset: (assetId: string) => void;
  unregisterWorkspaceAsset: (assetId: string) => void;
  updateItems: (items: StudioItem[]) => void;
  updateViewport: (viewport: WorkspaceViewport) => void;
  addItem: (type: StudioItemType, props: unknown, position?: { x: number; y: number }) => void;
  updateItem: (id: string, updates: StudioItemUpdate) => void;
  updateItemProps: (id: string, propsUpdate: any) => void;
  batchUpdateItems: (updates: Array<{ id: string; changes: StudioItemUpdate; props?: any }>) => void;
  removeItem: (id: string) => void;
  removeItems: (ids: string[]) => void;
  duplicateItems: (ids: string[]) => void;
  
  // Clipboard
  copiedItems: StudioItem[];
  copyItems: (ids: string[]) => void;
  cutItems: (ids: string[]) => void;
  pasteItems: (offset?: { x: number; y: number }) => void;
  
  addConnection: (fromId: string, toId: string) => void;
  removeConnection: (id: string) => void;

  syncWithServer: () => Promise<void>;
  saveNow: () => Promise<void>;
  renameWorkspace: (title: string) => Promise<void>;
  
  // Legacy Tldraw compatibility (temporary)
  addShape: (type: string, props: any) => void;
  setEditor: (editor: any) => void;
}


function clearLegacyWorkspaceCache() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem("workspace-storage");
  } catch (error) {
    console.warn("Failed to clear legacy workspace cache", error);
  }
}

// Keep workspace snapshots in memory only. Tldraw stores imported media inline by default,
// which makes persisted scene JSON large enough to exceed browser storage quotas.
export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  clearLegacyWorkspaceCache();

  return {
    workspaceId: null,
    title: "Untitled Workspace",
    coverAssetId: null,
    workspaceAssetIds: [],
    items: [],
    connections: [],
    viewport: { ...DEFAULT_WORKSPACE_VIEWPORT },
    version: 0,
    isLoading: false,
    error: null,
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
    copiedItems: [],

    loadWorkspace: async (id: string) => {
      set({ isLoading: true, error: null });
      try {
        const response = await fetch(`/api/workspace/${id}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message =
            payload && typeof payload.error === "string" && payload.error.trim().length > 0
              ? payload.error
              : `Failed to load workspace (${response.status})`;
          throw new Error(message);
        }
        const data = await response.json();
        
        const parsedScene = parseWorkspaceSceneJson(data.sceneJson);

        set({
          workspaceId: id,
          title: data.title,
          coverAssetId: typeof data.coverAssetId === "string" ? data.coverAssetId : null,
          workspaceAssetIds: parsedScene.workspaceAssetIds ?? [],
          items: parsedScene.items,
          connections: parsedScene.connections,
          viewport: parsedScene.viewport,
          version: data.version,
          isLoading: false,
          isDirty: false,
          lastSavedAt: Date.now(),
        });
      } catch (error: any) {
        set({ error: error.message, isLoading: false });
      }
    },

    hydrateWorkspace: (payload) => {
      const parsedScene = parseWorkspaceSceneJson(payload.sceneJson);

      set({
        workspaceId: payload.id,
        title: payload.title,
        coverAssetId:
          typeof payload.coverAssetId === "string" ? payload.coverAssetId : null,
        workspaceAssetIds: parsedScene.workspaceAssetIds ?? [],
        items: parsedScene.items,
        connections: parsedScene.connections,
        viewport: parsedScene.viewport,
        version: payload.version ?? 0,
        isLoading: false,
        error: null,
        isDirty: false,
        lastSavedAt: Date.now(),
      });
    },

    updateItems: (items: StudioItem[]) => {
      set({ items, isDirty: true });
    },

    registerWorkspaceAsset: (assetId: string) => {
      if (!assetId) return;

      const { workspaceAssetIds } = get();
      if (workspaceAssetIds.includes(assetId)) {
        return;
      }

      set({
        workspaceAssetIds: [...workspaceAssetIds, assetId],
        isDirty: true,
      });
    },

    unregisterWorkspaceAsset: (assetId: string) => {
      if (!assetId) return;

      const { workspaceAssetIds } = get();
      if (!workspaceAssetIds.includes(assetId)) {
        return;
      }

      set({
        workspaceAssetIds: workspaceAssetIds.filter((id) => id !== assetId),
        isDirty: true,
      });
    },

    updateViewport: (viewport: WorkspaceViewport) => {
      set({ viewport, isDirty: true });
    },

    addItem: (type: StudioItemType, props: unknown, position?: { x: number; y: number }) => {
      const { items, viewport } = get();
      const newItem = createWorkspaceItem(type, props, {
        x: position?.x ?? -viewport.x / viewport.zoom + 100,
        y: position?.y ?? -viewport.y / viewport.zoom + 100,
        zIndex: items.length > 0 ? Math.max(...items.map((item) => item.zIndex)) + 1 : 1,
      });

      if (!newItem) {
        console.warn("Rejected invalid workspace item", { type, props });
        return;
      }

      set({ items: [...items, newItem], isDirty: true });
    },

    updateItem: (id: string, updates: StudioItemUpdate) => {
      const { items } = get();
      set({
        items: items.map((item: StudioItem) => {
          if (item.id !== id) return item;
          let updated = { ...item, ...updates };

          // Sync startPoint and endPoint if dimensions change on line/arrow
          if (item.type === "shape" && (item.props.kind === "line" || item.props.kind === "arrow")) {
            const hasX = updates.x !== undefined && updates.x !== item.x;
            const hasY = updates.y !== undefined && updates.y !== item.y;
            const hasW = updates.w !== undefined && updates.w !== item.w;
            const hasH = updates.h !== undefined && updates.h !== item.h;

            if ((hasX || hasY || hasW || hasH) && item.props.startPoint && item.props.endPoint) {
              const oldX = item.x;
              const oldY = item.y;
              const oldW = Math.max(1, item.w);
              const oldH = Math.max(1, item.h);

              const newX = updates.x !== undefined ? updates.x : oldX;
              const newY = updates.y !== undefined ? updates.y : oldY;
              const newW = updates.w !== undefined ? updates.w : oldW;
              const newH = updates.h !== undefined ? updates.h : oldH;

              const tX1 = (item.props.startPoint.x - oldX) / oldW;
              const tY1 = (item.props.startPoint.y - oldY) / oldH;
              const tX2 = (item.props.endPoint.x - oldX) / oldW;
              const tY2 = (item.props.endPoint.y - oldY) / oldH;

              updated.props = {
                ...item.props,
                startPoint: { x: newX + tX1 * newW, y: newY + tY1 * newH },
                endPoint: { x: newX + tX2 * newW, y: newY + tY2 * newH },
              };
            }
          }

          return updated;
        }),
        isDirty: true,
      });
    },

    updateItemProps: (id, propsUpdate) => {
      const { items } = get();
      set({
        items: items.map((item: StudioItem) =>
          item.id === id ? { ...item, props: { ...item.props, ...propsUpdate } } : item
        ),
        isDirty: true,
      });
    },

    batchUpdateItems: (updates) => {
      const { items } = get();
      const updateMap = new Map(updates.map(u => [u.id, u]));
      set({
        items: items.map((item: StudioItem) => {
          const up = updateMap.get(item.id);
          if (!up) return item;
          let mergedChanges = { ...up.changes };
          let mergedProps = up.props ? { ...item.props, ...up.props } : item.props;

          // Sync startPoint and endPoint if dimensions change on line/arrow
          if (item.type === "shape" && (item.props.kind === "line" || item.props.kind === "arrow")) {
            const hasX = mergedChanges.x !== undefined && mergedChanges.x !== item.x;
            const hasY = mergedChanges.y !== undefined && mergedChanges.y !== item.y;
            const hasW = mergedChanges.w !== undefined && mergedChanges.w !== item.w;
            const hasH = mergedChanges.h !== undefined && mergedChanges.h !== item.h;

            const upHasEndpoints = up.props && (up.props.startPoint !== undefined || up.props.endPoint !== undefined);

            if ((hasX || hasY || hasW || hasH) && !upHasEndpoints && item.props.startPoint && item.props.endPoint) {
              const oldX = item.x;
              const oldY = item.y;
              const oldW = Math.max(1, item.w);
              const oldH = Math.max(1, item.h);

              const newX = mergedChanges.x !== undefined ? mergedChanges.x : oldX;
              const newY = mergedChanges.y !== undefined ? mergedChanges.y : oldY;
              const newW = mergedChanges.w !== undefined ? mergedChanges.w : oldW;
              const newH = mergedChanges.h !== undefined ? mergedChanges.h : oldH;

              const tX1 = (item.props.startPoint.x - oldX) / oldW;
              const tY1 = (item.props.startPoint.y - oldY) / oldH;
              const tX2 = (item.props.endPoint.x - oldX) / oldW;
              const tY2 = (item.props.endPoint.y - oldY) / oldH;

              mergedProps = {
                ...mergedProps,
                startPoint: { x: newX + tX1 * newW, y: newY + tY1 * newH },
                endPoint: { x: newX + tX2 * newW, y: newY + tY2 * newH },
              };
            }
          }

          return { ...item, ...mergedChanges, props: mergedProps };
        }),
        isDirty: true,
      });
    },

    removeItem: (id: string) => {
      const { items, connections } = get();
      set({ 
        items: items.filter((item: StudioItem) => item.id !== id),
        // Also remove any connections linked to this item
        connections: connections.filter(c => c.fromId !== id && c.toId !== id),
        isDirty: true 
      });
    },

    removeItems: (ids) => {
      const { items, connections } = get();
      const idSet = new Set(ids);
      set({
        items: items.filter((item: StudioItem) => !idSet.has(item.id)),
        connections: connections.filter(c => !idSet.has(c.fromId) && !idSet.has(c.toId)),
        isDirty: true,
      });
    },

    duplicateItems: (ids) => {
      const { items } = get();
      const idSet = new Set(ids);
      const itemsToDuplicate = items.filter(item => idSet.has(item.id));
      if (itemsToDuplicate.length === 0) return;

      const maxZIndex = items.length > 0 ? Math.max(...items.map(item => item.zIndex)) : 1;
      const newItems = itemsToDuplicate.map((item, index) => {
        const nextProps = JSON.parse(JSON.stringify(item.props));
        const newId = item.type === "shape" ? `shape-${Math.random().toString(36).slice(2, 11)}` : `item-${Math.random().toString(36).slice(2, 11)}`;
        return {
          ...item,
          id: newId,
          x: item.x + 30,
          y: item.y + 30,
          zIndex: maxZIndex + 1 + index,
          props: nextProps,
        } as StudioItem;
      });

      set({
        items: [...items, ...newItems],
        isDirty: true,
      });
    },

    copyItems: (ids) => {
      const { items } = get();
      const idSet = new Set(ids);
      const selected = items.filter(item => idSet.has(item.id));
      set({ copiedItems: JSON.parse(JSON.stringify(selected)) });
    },

    cutItems: (ids) => {
      const { items, connections, copyItems } = get();
      copyItems(ids);
      const idSet = new Set(ids);
      set({
        items: items.filter(item => !idSet.has(item.id)),
        connections: connections.filter(c => !idSet.has(c.fromId) && !idSet.has(c.toId)),
        isDirty: true,
      });
    },

    pasteItems: (offset) => {
      const { items, copiedItems } = get();
      if (!copiedItems || copiedItems.length === 0) return;
      
      const maxZIndex = items.length > 0 ? Math.max(...items.map(item => item.zIndex)) : 1;
      const dx = offset?.x ?? 30;
      const dy = offset?.y ?? 30;

      const pasted = copiedItems.map((item, index) => {
        const newId = item.type === "shape" ? `shape-${Math.random().toString(36).slice(2, 11)}` : `item-${Math.random().toString(36).slice(2, 11)}`;
        return {
          ...item,
          id: newId,
          x: item.x + dx,
          y: item.y + dy,
          zIndex: maxZIndex + 1 + index,
          props: JSON.parse(JSON.stringify(item.props)),
        } as StudioItem;
      });

      set({
        items: [...items, ...pasted],
        copiedItems: pasted,
        isDirty: true,
      });
    },

    addConnection: (fromId: string, toId: string) => {
      const { connections } = get();
      // Avoid duplicate connections
      if (connections.some(c => (c.fromId === fromId && c.toId === toId) || (c.fromId === toId && c.toId === fromId))) {
        return;
      }

      const newConnection: Connection = {
        id: `conn-${Math.random().toString(36).slice(2, 11)}`,
        fromId,
        toId,
      };

      set({ connections: [...connections, newConnection], isDirty: true });
    },

    removeConnection: (id: string) => {
      const { connections } = get();
      set({ connections: connections.filter(c => c.id !== id), isDirty: true });
    },

    syncWithServer: async () => {
      const { workspaceId, items, connections, viewport, workspaceAssetIds, version, isSaving } = get();
      if (!workspaceId || isSaving) return;

      const sceneJson = serializeWorkspaceScene({ items, connections, viewport, workspaceAssetIds });
      
      set({ isSaving: true });
      try {
        const response = await fetch(`/api/workspace/${workspaceId}/snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneJson, version }),
        });
        if (!response.ok) throw new Error("Failed to sync workspace");
        const data = await response.json();
        set({ version: data.version, isDirty: false, isSaving: false, lastSavedAt: Date.now() });
      } catch (error: any) {
        console.warn("Workspace sync warning:", error.message);
        set({ isSaving: false });
      }
    },

    saveNow: async () => {
      const { syncWithServer } = get();
      await syncWithServer();
    },

    renameWorkspace: async (newTitle: string) => {
      const { workspaceId } = get();
      if (!workspaceId) return;

      set({ title: newTitle });

      try {
        const response = await fetch(`/api/workspace/${workspaceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });
        if (!response.ok) throw new Error("Failed to rename workspace");
      } catch (error: any) {
        console.warn("Workspace rename warning:", error.message);
      }
    },

    // Legacy Bridge
    addShape: (type, props) => {
      get().addItem(type as any, props);
    },
    setEditor: () => {},
  };
});
