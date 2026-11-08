"use client";

import dynamic from "next/dynamic";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useViewerStore } from "@/hooks/use-viewer-store";
import { Loader2, ArrowLeft, Save, CheckCircle2, Video, FileText, Maximize2, RefreshCw, AlertCircle, Music4, Globe } from "lucide-react";

// Dynamically import tldraw to avoid SSR issues
const TldrawCanvas = dynamic(
  () => import("@/components/workspace/canvas").then((mod) => mod.TldrawCanvas),
  {
    ssr: false,
    loading: () => <div className="w-full h-full bg-white" />,
  }
);

// Dynamically import FloatingViewer since it loads heavy PDF/Video modules
const FloatingViewer = dynamic(
  () => import("@/components/workspace/viewer").then((mod) => mod.FloatingViewer),
  {
    ssr: false,
    loading: () => null,
  }
);

function getWorkspacePreloadKey(workspaceId: string) {
  return `workspace-preload:${workspaceId}`;
}

export default function WorkspacePage() {
  const router = useRouter();
  const { id } = useParams();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [showSlowLoadHint, setShowSlowLoadHint] = useState(false);
  const handledAutoOpenRef = useRef<string | null>(null);
  
  const { 
    loadWorkspace, 
    hydrateWorkspace,
    title, 
    error,
    isSaving, 
    isDirty, 
    lastSavedAt,
    saveNow,
    renameWorkspace
  } = useWorkspaceStore();
  
  const { viewers, closeViewer, openViewer, resetViewers } = useViewerStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading) {
      setShowSlowLoadHint(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowSlowLoadHint(true);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (id) {
      handledAutoOpenRef.current = null;
      resetViewers();

      let usedPrefetch = false;

      try {
        const cached = window.sessionStorage.getItem(getWorkspacePreloadKey(id as string));
        if (cached) {
          const parsed = JSON.parse(cached);
          hydrateWorkspace({
            id: parsed.id,
            title: parsed.title,
            sceneJson: parsed.sceneJson,
            version: parsed.version,
          });
          window.sessionStorage.removeItem(getWorkspacePreloadKey(id as string));
          usedPrefetch = true;
          setLoading(false);
          void loadWorkspace(id as string);
        }
      } catch (error) {
        console.warn("Failed to hydrate prefetched workspace", error);
      }

      if (!usedPrefetch) {
        setLoading(true);
        loadWorkspace(id as string).finally(() => setLoading(false));
      }
    }
  }, [hydrateWorkspace, id, loadWorkspace, resetViewers]);

  // Handle unsaved changes warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveNow();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveNow]);

  useEffect(() => {
    const assetId = searchParams.get("assetId");
    if (!assetId) return;
    const autoOpenKey = `${id}:${assetId}`;
    if (handledAutoOpenRef.current === autoOpenKey) return;
    if (viewers.some((viewer) => viewer.id === assetId || viewer.assetId === assetId)) return;

    let active = true;

    const loadAssetViewer = async () => {
      try {
        const response = await fetch(`/api/assets/${assetId}`);
        if (!response.ok) {
          throw new Error("Failed to load asset");
        }

        const asset = await response.json();
        if (!active) return;

        const type =
          asset.kind === "pdf" ? "pdf" : asset.kind === "video" ? "video" : null;
        if (!type) return;

        handledAutoOpenRef.current = autoOpenKey;
        openViewer({
          id: asset.id,
          title: asset.title,
          type,
          contentUrl: asset.contentUrl,
          assetId: asset.id,
          revisionId: asset.currentRevisionId ?? undefined,
        });

        const nextSearchParams = new URLSearchParams(searchParams.toString());
        nextSearchParams.delete("assetId");
        const nextUrl = nextSearchParams.toString()
          ? `/workspaces/${id}?${nextSearchParams.toString()}`
          : `/workspaces/${id}`;
        router.replace(nextUrl);
      } catch (error) {
        console.warn("Failed to auto-open asset viewer", error);
      }
    };

    void loadAssetViewer();

    return () => {
      active = false;
    };
  }, [id, openViewer, router, searchParams, viewers]);

  const handleTitleSubmit = () => {
    if (tempTitle.trim() && tempTitle !== title) {
      renameWorkspace(tempTitle.trim());
    }
    setEditingTitle(false);
  };

  const startEditingTitle = () => {
    setTempTitle(title);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const handleRetryWorkspaceLoad = () => {
    if (!id) return;

    setShowSlowLoadHint(false);
    setLoading(true);
    loadWorkspace(id as string).finally(() => setLoading(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-slate-50">
        <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          {showSlowLoadHint ? (
            <>
              <div>
                <p className="text-sm font-semibold text-slate-700">This workspace is taking longer than expected.</p>
                <p className="mt-1 text-xs text-slate-500">
                  The app is still waiting for the workspace data or canvas bundle to finish loading.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRetryWorkspaceLoad}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-100"
              >
                <RefreshCw className="w-4 h-4" />
                Retry load
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Workspace failed to load</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleRetryWorkspaceLoad}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-14 border-b bg-white flex items-center px-4 justify-between shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.back()}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"
            title="Go Back"
          >
            <ArrowLeft size={18} />
          </button>
          
          <div className="h-6 w-px bg-slate-200" />
          
          <div className="flex items-center gap-3">
            {editingTitle ? (
              <div className="flex items-center gap-1">
                <input
                  ref={titleInputRef}
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  onBlur={(e) => {
                    // Prevent blur from firing if we clicked the save button
                    if (!e.relatedTarget?.closest('.title-save-btn')) {
                      handleTitleSubmit();
                    }
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleTitleSubmit()}
                  className="font-semibold text-slate-800 bg-slate-100 px-2 py-1 rounded outline-none border border-indigo-300 w-64"
                  placeholder="Workspace Title"
                />
                <button
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input blur
                    handleTitleSubmit();
                  }}
                  className="title-save-btn p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                  title="Save Title"
                >
                  <CheckCircle2 size={16} />
                </button>
              </div>
            ) : (
              <h1 
                onClick={startEditingTitle}
                className="font-semibold text-slate-800 cursor-pointer hover:bg-slate-100 px-2 py-1 rounded -ml-2 transition-colors max-w-sm truncate"
                title="Click to rename"
              >
                {title}
              </h1>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Minimized Viewers */}
          <div className="flex items-center gap-2 border-r border-slate-200 pr-4 mr-2">
            {viewers.filter(v => v.minimized).map(viewer => (
              <div key={viewer.id} className="relative group">
                <button
                  onClick={() => useViewerStore.getState().setViewerMinimized(viewer.id, false)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-500 hover:text-indigo-600 transition-colors"
                >
                  {viewer.type === "webpage"
                    ? <Globe size={16} />
                    : viewer.mediaKind === "audio" || viewer.mimeType?.startsWith("audio/")
                    ? <Music4 size={16} />
                    : viewer.type === "video"
                      ? <Video size={16} />
                      : <FileText size={16} />}
                </button>
                
                {/* Tooltip */}
                <div className="absolute top-full right-0 mt-2 w-48 bg-slate-800 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none p-2 border border-slate-700">
                  <div className="font-semibold truncate mb-1 text-slate-200">{viewer.title}</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                    <Maximize2 size={10} />
                    Click to maximize
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm">
            {isSaving ? (
              <span className="text-slate-400 flex items-center gap-1.5 text-xs font-medium">
                <Loader2 size={12} className="animate-spin" />
                Saving...
              </span>
            ) : isDirty ? (
              <span className="text-amber-600 flex items-center gap-1.5 text-xs font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Unsaved changes
              </span>
            ) : lastSavedAt ? (
              <span className="text-emerald-600 flex items-center gap-1.5 text-xs font-medium">
                <CheckCircle2 size={12} />
                Saved
              </span>
            ) : null}
            
            <button
              onClick={() => saveNow()}
              disabled={isSaving || !isDirty}
              className={`ml-2 px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
                isDirty 
                  ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" 
                  : "bg-slate-50 text-slate-400 cursor-default"
              }`}
            >
              <Save size={14} />
              Save
            </button>
          </div>
        </div>
      </header>

      {/* Canvas Layer */}
      <div className="flex-1 relative z-0 min-h-0">
        <TldrawCanvas workspaceId={id as string} />
      </div>

      {/* Floating Viewer Layer */}
      {viewers.map((viewer) => (
        <FloatingViewer 
          key={viewer.id} 
          {...viewer} 
          onClose={() => closeViewer(viewer.id)} 
        />
      ))}
    </div>
  );
}
