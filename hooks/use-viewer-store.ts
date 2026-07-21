import { create } from "zustand";

interface Viewer {
  id: string;
  title: string;
  type: "pdf" | "video" | "webpage";
  contentUrl: string;
  mediaKind?: string;
  mimeType?: string | null;
  sourceUrl?: string | null;
  sourceHost?: string | null;
  assetId?: string;
  revisionId?: string;
  currentTime?: number; // for video
  seekToken?: number;
  minimized?: boolean;
  zIndex?: number;
}

interface ViewerState {
  viewers: Viewer[];
  openViewer: (viewer: Viewer) => void;
  closeViewer: (id: string) => void;
  seekTo: (id: string, timeMs: number) => void;
  setViewerMinimized: (id: string, minimized: boolean) => void;
  bringViewerToFront: (id: string) => void;
  open: (assetId: string, type: "pdf" | "video" | "webpage", pageNumber?: number) => Promise<void>;
  resetViewers: () => void;
}

function getNextViewerZIndex(viewers: Viewer[]) {
  return Math.max(100, ...viewers.map((viewer) => viewer.zIndex ?? 100)) + 1;
}

export const useViewerStore = create<ViewerState>((set) => ({
  viewers: [],
  openViewer: (viewer) => set((state) => {
    const viewerId = viewer.assetId ?? viewer.id;
    const nextZIndex = getNextViewerZIndex(state.viewers);
    const normalizedViewer: Viewer = {
      ...viewer,
      id: viewerId,
      assetId: viewer.assetId ?? viewer.id,
      minimized: viewer.minimized ?? false,
      zIndex: nextZIndex,
    };

    const existingIndex = state.viewers.findIndex(
      (entry) =>
        entry.id === normalizedViewer.id ||
        (entry.assetId && normalizedViewer.assetId && entry.assetId === normalizedViewer.assetId),
    );

    if (existingIndex === -1) {
      return { viewers: [...state.viewers, normalizedViewer] };
    }

    return {
      viewers: state.viewers.map((entry, index) =>
        index === existingIndex ? { ...entry, ...normalizedViewer, minimized: false } : entry,
      ),
    };
  }),
  closeViewer: (id) => set((state) => ({
    viewers: state.viewers.filter((viewer) => viewer.id !== id && viewer.assetId !== id),
  })),
  seekTo: (id, timeMs) => set((state) => ({
    viewers: state.viewers.map((viewer) =>
      viewer.id === id || viewer.assetId === id
        ? {
            ...viewer,
            currentTime: timeMs,
            seekToken: (viewer.seekToken ?? 0) + 1,
          }
        : viewer,
    ),
  })),
  setViewerMinimized: (id, minimized) => set((state) => ({
    viewers: state.viewers.map((viewer) =>
      viewer.id === id || viewer.assetId === id
        ? {
            ...viewer,
            minimized,
            zIndex: minimized ? viewer.zIndex : getNextViewerZIndex(state.viewers),
          }
        : viewer,
    ),
  })),
  bringViewerToFront: (id) => set((state) => {
    const target = state.viewers.find((viewer) => viewer.id === id || viewer.assetId === id);
    if (!target) {
      return state;
    }

    const currentMaxZIndex = Math.max(100, ...state.viewers.map((viewer) => viewer.zIndex ?? 100));
    if ((target.zIndex ?? 100) >= currentMaxZIndex) {
      return state;
    }

    const nextZIndex = currentMaxZIndex + 1;
    return {
      viewers: state.viewers.map((viewer) =>
        viewer.id === id || viewer.assetId === id
          ? { ...viewer, zIndex: nextZIndex }
          : viewer,
      ),
    };
  }),
  open: async (assetId, type, pageNumber) => {
    const existingViewer = useViewerStore
      .getState()
      .viewers.find((viewer) => viewer.assetId === assetId || viewer.id === assetId);

    if (existingViewer) {
      useViewerStore.getState().openViewer({
        ...existingViewer,
        minimized: false,
      });
      return;
    }

    let title = type === "pdf" ? "PDF Document" : type === "webpage" ? "Web Page" : "Video";
    let contentUrl = `/api/assets/${assetId}/content`;
    let revisionId: string | undefined;

    try {
      const response = await fetch(`/api/assets/${assetId}`);
      if (response.ok) {
        const asset = await response.json();
        title = asset.title || title;
        contentUrl = asset.contentUrl || contentUrl;
        revisionId = asset.currentRevisionId ?? undefined;
        const mediaKind = typeof asset.kind === "string" ? asset.kind : undefined;
        const mimeType = typeof asset.mimeType === "string" ? asset.mimeType : null;
        const sourceUrl = typeof asset.sourceUrl === "string" ? asset.sourceUrl : null;
        const sourceHost = typeof asset.sourceHost === "string" ? asset.sourceHost : null;
        useViewerStore.getState().openViewer({
          id: assetId,
          assetId,
          type,
          title,
          contentUrl,
          revisionId,
          mediaKind,
          mimeType,
          sourceUrl,
          sourceHost,
          minimized: false,
        });
        return;
      }
    } catch (error) {
      console.warn("Failed to load asset metadata for viewer", error);
    }

    useViewerStore.getState().openViewer({
      id: assetId,
      assetId,
      type,
      title,
      contentUrl,
      revisionId,
      sourceUrl: undefined,
      sourceHost: undefined,
      minimized: false,
    });
  },
  resetViewers: () => set({ viewers: [] }),
}));
