import { create } from "zustand";
import {
  DEFAULT_WORKSPACE_VIEWPORT,
  PreservedWorkspaceItem,
  StudioItem,
  StudioItemType,
  WorkspaceViewport,
  createWorkspaceItem,
  parseWorkspaceSceneJson,
  serializeWorkspaceScene,
} from "@/types/workspace";
import { connectorsForSelection, isConnectorAttachedToAny, remapConnector, withoutOrphanConnectors } from "@/lib/workspace/connector-lifecycle";
import { WorkspaceHistory, sameItems } from "@/lib/workspace/workspace-history";
import { unlockedIds, withFreshGroupIds } from "@/lib/workspace/element-lock";
import { CLIENT_OUTDATED_CODE, WORKSPACE_SCENE_CLIENT_BUILD } from "@/lib/workspace/scene-compat";

const newItemId = () => `item-${Math.random().toString(36).slice(2, 11)}`;
const newGroupId = () => `group-${Math.random().toString(36).slice(2, 11)}`;

type StudioItemUpdate = Partial<
  Pick<StudioItem, "x" | "y" | "w" | "h" | "rotation" | "zIndex">
>;

/**
 * `recordHistory: false` is for changes that are not user edits and must not
 * become an undo step or clear redo: layout derived from content (auto-size,
 * natural image size) and items removed because their server asset was deleted.
 */
type ItemChangeOptions = { recordHistory?: boolean };

interface WorkspaceState {
  workspaceId: string | null;
  title: string;
  coverAssetId: string | null;
  workspaceAssetIds: string[];
  items: StudioItem[];
  /** Items written by a newer build: never rendered, saved back unchanged. */
  preservedItems: PreservedWorkspaceItem[];
  viewport: WorkspaceViewport;
  version: number;
  isLoading: boolean;
  error: string | null;
  /** The server refused this build's saves; autosave stops until the page reloads. */
  saveBlocked: boolean;

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
  updateItems: (items: StudioItem[], options?: ItemChangeOptions) => void;
  updateViewport: (viewport: WorkspaceViewport) => void;
  /** Adds an item on top of the stack; returns its id, or undefined when the props are rejected. */
  addItem: (type: StudioItemType, props: unknown, position?: { x: number; y: number }) => string | undefined;
  updateItem: (id: string, updates: StudioItemUpdate, options?: ItemChangeOptions) => void;
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

  // Undo / redo of item changes (viewport is not part of history)
  canUndo: boolean;
  canRedo: boolean;
  /** Returns true when a step was undone. */
  undo: () => boolean;
  /** Returns true when a step was redone. */
  redo: () => boolean;
  /** Ends the current undo step; called at each new pointer press / key action. */
  breakHistoryCapture: () => void;

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

  const history = new WorkspaceHistory();

  /** Publish the history flags only when they change, to avoid re-rendering every subscriber. */
  const historyFlags = (): Partial<WorkspaceState> => {
    const { canUndo, canRedo } = get();
    return canUndo === history.canUndo && canRedo === history.canRedo
      ? {}
      : { canUndo: history.canUndo, canRedo: history.canRedo };
  };

  /**
   * Every item mutation goes through here so it joins the undo history and a
   * deleted element never leaves a connector attached to nothing.
   */
  const commitItems = (
    nextItems: StudioItem[],
    options?: ItemChangeOptions,
    extra?: Partial<WorkspaceState>,
  ) => {
    const items = withoutOrphanConnectors(nextItems, get().preservedItems.map((item) => item.id));
    const previous = get().items;
    if (options?.recordHistory !== false && !sameItems(previous, items)) {
      history.record(previous);
    }
    set({ ...extra, items, isDirty: true, ...historyFlags() });
  };

  return {
    workspaceId: null,
    title: "Untitled Workspace",
    coverAssetId: null,
    workspaceAssetIds: [],
    items: [],
    preservedItems: [],
    viewport: { ...DEFAULT_WORKSPACE_VIEWPORT },
    version: 0,
    isLoading: false,
    error: null,
    saveBlocked: false,
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
    copiedItems: [],
    canUndo: false,
    canRedo: false,

    loadWorkspace: async (id: string) => {
      set({ isLoading: true, error: null, workspaceId: null, isSaving: false, saveBlocked: false });
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

        history.reset();
        set({
          canUndo: false,
          canRedo: false,
          workspaceId: id,
          title: data.title,
          coverAssetId: typeof data.coverAssetId === "string" ? data.coverAssetId : null,
          workspaceAssetIds: parsedScene.workspaceAssetIds ?? [],
          items: parsedScene.items,
          preservedItems: parsedScene.preservedItems,
          viewport: parsedScene.viewport,
          version: data.version,
          isLoading: false,
          isSaving: false,
          isDirty: false,
          lastSavedAt: Date.now(),
        });
      } catch (error: any) {
        set({ error: error.message, isLoading: false });
      }
    },

    hydrateWorkspace: (payload) => {
      const parsedScene = parseWorkspaceSceneJson(payload.sceneJson);

      history.reset();
      set({
        canUndo: false,
        canRedo: false,
        workspaceId: payload.id,
        title: payload.title,
        coverAssetId:
          typeof payload.coverAssetId === "string" ? payload.coverAssetId : null,
        workspaceAssetIds: parsedScene.workspaceAssetIds ?? [],
        items: parsedScene.items,
        preservedItems: parsedScene.preservedItems,
        viewport: parsedScene.viewport,
        version: payload.version ?? 0,
        isLoading: false,
        isSaving: false,
        saveBlocked: false,
        error: null,
        isDirty: false,
        lastSavedAt: Date.now(),
      });
    },

    updateItems: (items: StudioItem[], options?: ItemChangeOptions) => {
      commitItems(items, options);
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
        return undefined;
      }

      commitItems([...items, newItem]);
      return newItem.id;
    },

    updateItem: (id: string, updates: StudioItemUpdate, options?: ItemChangeOptions) => {
      const { items } = get();
      commitItems(
        items.map((item: StudioItem) => {
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
        options,
      );
    },

    updateItemProps: (id, propsUpdate) => {
      const { items } = get();
      commitItems(
        items.map((item: StudioItem) =>
          item.id === id ? { ...item, props: { ...item.props, ...propsUpdate } } : item
        ),
      );
    },

    batchUpdateItems: (updates) => {
      const { items } = get();
      const updateMap = new Map(updates.map(u => [u.id, u]));
      commitItems(
        items.map((item: StudioItem) => {
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
      );
    },

    removeItem: (id: string) => {
      const { items } = get();
      commitItems(
        items.filter((item: StudioItem) => item.id !== id && !isConnectorAttachedToAny(item, new Set([id]))),
      );
    },

    removeItems: (ids) => {
      const { items } = get();
      // Locked elements are never deleted.
      const idSet = new Set(unlockedIds(items, ids));
      if (idSet.size === 0) return;
      commitItems(
        items.filter((item: StudioItem) => !idSet.has(item.id) && !isConnectorAttachedToAny(item, idSet)),
      );
    },

    duplicateItems: (ids) => {
      const { items } = get();
      const selectedIds = new Set(ids);
      const sourceNodes = items.filter((item) => selectedIds.has(item.id) && item.type !== "connector");
      // Connectors attached to duplicated nodes, plus selected (e.g. free) connectors.
      const attachedConnectors = connectorsForSelection(items, selectedIds);
      if (sourceNodes.length === 0 && attachedConnectors.length === 0) return;

      const nodeIdMap = new Map<string, string>();
      sourceNodes.forEach((item) => nodeIdMap.set(item.id, newItemId()));
      const maxZIndex = items.length > 0 ? Math.max(...items.map((item) => item.zIndex)) : 1;
      const duplicatedNodes = sourceNodes.map((item, index) => ({
        ...item,
        id: nodeIdMap.get(item.id)!,
        x: item.x + 30,
        y: item.y + 30,
        zIndex: maxZIndex + 1 + index,
        props: JSON.parse(JSON.stringify(item.props)),
      } as StudioItem));
      const duplicatedConnectors = attachedConnectors.flatMap((item, index) => {
        if (item.type !== "connector") return [];
        const copy = remapConnector(item, nodeIdMap, { x: 30, y: 30 }, {
          id: newItemId(),
          zIndex: maxZIndex + 1 + duplicatedNodes.length + index,
        });
        return copy ? [copy] : [];
      });
      commitItems([...items, ...withFreshGroupIds([...duplicatedNodes, ...duplicatedConnectors], newGroupId)]);
    },

    copyItems: (ids) => {
      const { items } = get();
      const selectedIds = new Set(ids);
      const selectedNodes = items.filter((item) => selectedIds.has(item.id) && item.type !== "connector");
      const attachedConnectors = connectorsForSelection(items, selectedIds);
      set({ copiedItems: JSON.parse(JSON.stringify([...selectedNodes, ...attachedConnectors])) });
    },

    cutItems: (ids) => {
      const { items, copyItems } = get();
      // Locked elements are neither cut nor removed.
      const cuttable = unlockedIds(items, ids);
      if (cuttable.length === 0) return;
      copyItems(cuttable);
      const idSet = new Set(cuttable);
      commitItems(items.filter((item) => !idSet.has(item.id) && !isConnectorAttachedToAny(item, idSet)));
    },

    pasteItems: (offset) => {
      const { items, copiedItems } = get();
      if (!copiedItems || copiedItems.length === 0) return;

      const sourceNodes = copiedItems.filter((item) => item.type !== "connector");
      const nodeIdMap = new Map<string, string>();
      sourceNodes.forEach((item) => nodeIdMap.set(item.id, `item-${Math.random().toString(36).slice(2, 11)}`));
      const maxZIndex = items.length > 0 ? Math.max(...items.map((item) => item.zIndex)) : 1;
      const dx = offset?.x ?? 30;
      const dy = offset?.y ?? 30;

      const pastedNodes = sourceNodes.map((item, index) => ({
        ...item,
        id: nodeIdMap.get(item.id)!,
        x: item.x + dx,
        y: item.y + dy,
        zIndex: maxZIndex + 1 + index,
        props: JSON.parse(JSON.stringify(item.props)),
      } as StudioItem));
      const pastedConnectors = copiedItems.flatMap((item, index) => {
        if (item.type !== "connector") return [];
        const pasted = remapConnector(item, nodeIdMap, { x: dx, y: dy }, {
          id: newItemId(),
          zIndex: maxZIndex + 1 + pastedNodes.length + index,
        });
        return pasted ? [pasted] : [];
      });

      const pasted = withFreshGroupIds([...pastedNodes, ...pastedConnectors], newGroupId);
      commitItems([...items, ...pasted], undefined, { copiedItems: pasted });
    },

    undo: () => {
      const restored = history.undo(get().items);
      set(restored ? { items: restored, isDirty: true, ...historyFlags() } : historyFlags());
      return restored !== null;
    },

    redo: () => {
      const restored = history.redo(get().items);
      set(restored ? { items: restored, isDirty: true, ...historyFlags() } : historyFlags());
      return restored !== null;
    },

    breakHistoryCapture: () => {
      history.breakCapture(get().items);
      const flags = historyFlags();
      if (Object.keys(flags).length > 0) set(flags);
    },

    syncWithServer: async () => {
      const initial = get();
      if (!initial.workspaceId || initial.isSaving || initial.saveBlocked) return;

      const savingWorkspaceId = initial.workspaceId;
      set({ isSaving: true });

      try {
        // Serialize saves. If edits happen while a request is in flight, send
        // the newest complete scene before declaring the workspace clean.
        while (true) {
          const current = get();
          if (current.workspaceId !== savingWorkspaceId) return;

          const sceneJson = serializeWorkspaceScene({
            items: current.items,
            viewport: current.viewport,
            workspaceAssetIds: current.workspaceAssetIds,
            preservedItems: current.preservedItems,
          });

          const response = await fetch(`/api/workspace/${savingWorkspaceId}/snapshot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sceneJson, version: current.version, clientBuild: WORKSPACE_SCENE_CLIENT_BUILD }),
          });
          if (response.status === 409) {
            const payload = await response.json().catch(() => null);
            if (payload?.code === CLIENT_OUTDATED_CODE) {
              // A newer build is live; saving from this one could lose its content.
              set({ saveBlocked: true, isDirty: true });
              return;
            }
          }
          if (!response.ok) {
            throw new Error(`Failed to sync workspace (${response.status})`);
          }

          const data = await response.json();
          const latest = get();
          if (latest.workspaceId !== savingWorkspaceId) return;

          const latestSceneJson = serializeWorkspaceScene({
            items: latest.items,
            viewport: latest.viewport,
            workspaceAssetIds: latest.workspaceAssetIds,
            preservedItems: latest.preservedItems,
          });

          set({ version: data.version, lastSavedAt: Date.now() });

          if (latestSceneJson === sceneJson) {
            set({ isDirty: false });
            break;
          }

          // State changed during the request; immediately persist the newer
          // scene rather than dropping it because isSaving was true.
          set({ isDirty: true });
        }
      } catch (error: any) {
        console.warn("Workspace sync warning:", error.message);
        set({ isDirty: true });
      } finally {
        if (get().workspaceId === savingWorkspaceId) {
          set({ isSaving: false });
        }
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
