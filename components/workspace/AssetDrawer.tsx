"use client";

import { Fragment, useState, useEffect, useRef } from "react";
import {
  Library,
  Search,
  FileText,
  Video,
  Image as ImageIcon,
  Music4,
  Globe,
  X,
  GripVertical,
  Plus,
  Link2,
  Upload,
  Loader2,
  Trash2,
  StickyNote,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import {
  WORKSPACE_UPLOAD_ACCEPT,
  getAssetKindLabel,
  inferUploadAssetKind,
} from "@/lib/utils/media-assets";
import { uploadWorkspaceAsset } from "@/lib/utils/multipart-upload";
import { useNotePanelStore } from "@/hooks/use-note-panel-store";
import type { NoteCardNode } from "@/types/workspace";
import { addNoteCardToBoard } from "./note-card-actions";

interface Asset {
  id: string;
  title: string;
  kind: "pdf" | "video" | "image" | "audio" | "webpage" | "snapshot";
  currentRevisionId: string | null;
  mimeType: string | null;
}

type BoardResource = { assetId: string; kind: Asset["kind"]; title: string; revisionId: string | null; noteIds: string[] };


export function AssetDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [boardResources, setBoardResources] = useState<BoardResource[]>([]);
  const [tab, setTab] = useState<"board" | "library">("board");
  const [kindFilter, setKindFilter] = useState<"all" | "pages" | "resources">("all");
  const [collapsedPages, setCollapsedPages] = useState<Set<string>>(new Set());
  const [allNotes, setAllNotes] = useState<Array<{ id: string; title: string }>>([]);
  const [touchDragPreview, setTouchDragPreview] = useState<{ assetId: string; x: number; y: number; width: number; height: number } | null>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const touchDragRef = useRef<{ asset: Asset; pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; width: number; height: number; moved: boolean } | null>(null);
  const workspaceItems = useWorkspaceStore((state) => state.items);
  const workspaceCoverAssetId = useWorkspaceStore((state) => state.coverAssetId);
  const workspaceAssetIdsFromStore = useWorkspaceStore((state) => state.workspaceAssetIds);
  const registerWorkspaceAsset = useWorkspaceStore((state) => state.registerWorkspaceAsset);
  const unregisterWorkspaceAsset = useWorkspaceStore((state) => state.unregisterWorkspaceAsset);
  const updateItems = useWorkspaceStore((state) => state.updateItems);

  useEffect(() => {
    if (isOpen) {
      void fetchAssets();
      void fetch("/api/notes")
        .then((response) => (response.ok ? response.json() : null))
        .then((json) => {
          if (Array.isArray(json?.data)) setAllNotes(json.data.map((note: { id: string; title: string }) => ({ id: note.id, title: note.title })));
        })
        .catch(() => undefined);
    }
  }, [isOpen]);

  // The resources of the pages on the board, refreshed when pages come and go.
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const cardNoteKey = [...new Set(workspaceItems.flatMap((item) => (item.type === "note-card" ? [item.props.noteId] : [])))].sort().join(",");
  useEffect(() => {
    if (!isOpen || !workspaceId) return;
    let active = true;
    void fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/resources?notes=${encodeURIComponent(cardNoteKey)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (active && Array.isArray(json?.data?.resources)) setBoardResources(json.data.resources);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [cardNoteKey, isOpen, workspaceId]);

  useEffect(() => {
    if (!showAddMenu) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) {
        setShowAddMenu(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showAddMenu]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/assets");
      if (response.ok) {
        const data = await response.json();
        setAssets(data.data || data);
      }
    } catch (error) {
      console.error("Failed to fetch assets", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePickUpload = () => {
    setShowAddMenu(false);
    setShowLinkForm(false);
    assetInputRef.current?.click();
  };

  const handleLinkSaved = async () => {
    const nextUrl = linkUrl.trim();
    const nextTitle = linkTitle.trim();

    if (!nextUrl) {
      toast.error("Paste a link to save it");
      return;
    }

    setIsSavingLink(true);
    toast.loading("Saving link...", { id: "vault-link" });

    try {
      const response = await fetch("/api/assets/register-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: nextUrl,
          title: nextTitle || undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save link");
      }

      const assetData = payload.data || payload;
      if (typeof assetData.assetId === "string" && assetData.assetId.trim().length > 0) {
        registerWorkspaceAsset(assetData.assetId);
      }

      await useWorkspaceStore.getState().saveNow();
      await fetchAssets();
      setLinkUrl("");
      setLinkTitle("");
      setShowLinkForm(false);
      setShowAddMenu(false);
      toast.success("Link added to Vault Library", { id: "vault-link" });
    } catch (error) {
      console.error("Failed to save link", error);
      toast.error(
        error instanceof Error ? error.message : "Couldn't save that link",
        { id: "vault-link" },
      );
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleAssetSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const assetKind = inferUploadAssetKind(file.type, file.name);
    if (!assetKind) {
      toast.error("That file type is not supported yet");
      return;
    }

    const assetLabel = getAssetKindLabel(assetKind);
    setIsUploadingAsset(true);
    toast.loading(`Uploading ${assetLabel}...`, { id: "vault-upload" });


    try {
      const uploaded = await uploadWorkspaceAsset(file);

      registerWorkspaceAsset(uploaded.assetId);

      await useWorkspaceStore.getState().saveNow();
      await fetchAssets();

      toast.success(`${assetLabel} added to Vault Library`, {
        id: "vault-upload",
      });
    } catch (error) {
      console.error("Failed to upload asset", error);

      toast.error(
        error instanceof Error
          ? error.message
          : `Couldn't upload that ${assetLabel.toLowerCase()}`,
        { id: "vault-upload" }
      );
    } finally {
      setIsUploadingAsset(false);
    }

  };

  const filteredAssets = assets.filter(asset =>
    asset.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const workspaceAssetIds = new Set(
    [
      workspaceCoverAssetId,
      ...workspaceAssetIdsFromStore,
      ...workspaceItems.map((item) => {
        const props = item.props as Record<string, unknown> | undefined;
        return typeof props?.assetId === "string" ? props.assetId : null;
      }),
    ].filter(Boolean) as string[],
  );

  // Two tabs: "This board" (its pages, each with the resources it uses, and
  // files placed on the board directly) and "Library" (everything else).
  const query = searchQuery.trim().toLowerCase();
  const matches = (title: string) => !query || title.toLowerCase().includes(query);
  const boardPages = workspaceItems
    .filter((item): item is NoteCardNode => item.type === "note-card")
    .map((item) => ({ noteId: item.props.noteId, title: item.props.title || "Untitled" }))
    .filter((page, index, all) => all.findIndex((other) => other.noteId === page.noteId) === index);
  const resourceAsset = (resource: BoardResource): Asset => ({
    id: resource.assetId, title: resource.title, kind: resource.kind, currentRevisionId: resource.revisionId, mimeType: null,
  });
  const resourcesOfPage = (noteId: string) => boardResources.filter((resource) => resource.noteIds.includes(noteId)).map(resourceAsset);
  const fromPages = new Set(boardResources.map((resource) => resource.assetId));
  const boardOnlyAssets = assets.filter((asset) => workspaceAssetIds.has(asset.id) && !fromPages.has(asset.id));
  const onBoardAssetIds = new Set([...fromPages, ...boardOnlyAssets.map((asset) => asset.id)]);
  const boardAllResources = [...boardResources.map(resourceAsset), ...boardOnlyAssets].filter((asset) => matches(asset.title));
  const onBoardNoteIds = new Set(boardPages.map((page) => page.noteId));
  const libraryPages = allNotes.filter((note) => !onBoardNoteIds.has(note.id) && matches(note.title || "Untitled"));
  const libraryAssets = filteredAssets.filter((asset) => !onBoardAssetIds.has(asset.id));
  const showPages = kindFilter !== "resources";
  const showResources = kindFilter !== "pages";

  const addPage = async (noteId: string) => {
    const added = await addNoteCardToBoard(noteId);
    if (!added) toast.error("That page could not be added.");
  };

  const renderAssetRow = (asset: Asset, detail: string | undefined, deletable: boolean) => (
                  <Fragment key={asset.id}>
                  {touchDragPreview?.assetId === asset.id ? (
                    <div
                      aria-hidden="true"
                      className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50"
                      style={{ height: touchDragPreview.height }}
                    />
                  ) : null}
                  <div
                    draggable
                    style={{
                      touchAction: "none",
                      ...(touchDragPreview?.assetId === asset.id ? {
                        position: "fixed" as const,
                        left: touchDragPreview.x,
                        top: touchDragPreview.y,
                        width: touchDragPreview.width,
                        height: touchDragPreview.height,
                        zIndex: 10002,
                        pointerEvents: "none" as const,
                        boxShadow: "0 16px 40px rgba(15,23,42,.22)",
                        transform: "scale(1.02)",
                      } : {}),
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType !== "touch") return;
                      event.preventDefault();
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      touchDragRef.current = {
                        asset,
                        pointerId: event.pointerId,
                        startX: event.clientX,
                        startY: event.clientY,
                        offsetX: event.clientX - rect.left,
                        offsetY: event.clientY - rect.top,
                        width: rect.width,
                        height: rect.height,
                        moved: false,
                      };
                    }}
                    onPointerMove={(event) => {
                      const drag = touchDragRef.current;
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) {
                        drag.moved = true;
                        setTouchDragPreview({
                          assetId: asset.id,
                          x: event.clientX - drag.offsetX,
                          y: event.clientY - drag.offsetY,
                          width: drag.width,
                          height: drag.height,
                        });
                      }
                    }}
                    onPointerCancel={(event) => {
                      if (touchDragRef.current?.pointerId === event.pointerId) {
                        touchDragRef.current = null;
                        setTouchDragPreview(null);
                      }
                    }}
                    onDragStart={(e) => {
                      const dragData = {
                        type: asset.kind,
                        kind: asset.kind,
                        assetId: asset.id,
                        title: asset.title,
                        revisionId: asset.currentRevisionId
                      };
                      e.dataTransfer.setData("application/vnd.second-brain.asset", JSON.stringify(dragData));
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="flex min-h-[36px] items-center gap-2.5 rounded-lg border border-transparent bg-white px-2 py-1 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40 cursor-grab active:cursor-grabbing group"
                  >
                    <div className={`p-1.5 rounded-md shrink-0 ${getAssetIconClassName(asset)}`}>
                      {renderAssetIcon(asset)}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-[13px] text-slate-700 group-hover:text-slate-900" title={detail ? `${asset.title} · ${detail}` : asset.title}>
                      {asset.title}
                    </p>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-tight text-slate-400">{getAssetKindLabel(asset.kind)}</span>
                    {deletable ? (
                    <button
                        className="rounded-md p-1.5 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                        title="Delete resource"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          event.preventDefault();
                          void handleDeleteAsset(asset);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                    <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 transition-colors shrink-0" />
                  </div>
                  </Fragment>
  );

  const handleDeleteAsset = async (asset: Asset) => {
    const confirmDelete = window.confirm(
      `Delete "${asset.title}" from your vault?\n\nThis removes it globally from your library. Any workspace using this resource may stop working.`,
    );

    if (!confirmDelete) {
      return;
    }

    toast.loading("Deleting resource...", { id: `asset-delete-${asset.id}` });

    try {
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete resource");
      }

      setAssets((current) => current.filter((entry) => entry.id !== asset.id));
      unregisterWorkspaceAsset(asset.id);
      updateItems(
        workspaceItems.filter((item) => {
          const props = item.props as Record<string, unknown> | undefined;
          return props?.assetId !== asset.id;
        }),
        // The asset no longer exists on the server, so undo must not restore items that reference it.
        { recordHistory: false },
      );
      toast.success("Resource deleted", { id: `asset-delete-${asset.id}` });
    } catch (error) {
      console.error("Failed to delete asset", error);
      toast.error(
        error instanceof Error ? error.message : "Couldn't delete that resource",
        { id: `asset-delete-${asset.id}` },
      );
    }
  };

  const renderAssetIcon = (asset: Asset) => {
    switch (asset.kind) {
      case "pdf":
        return <FileText className="w-4 h-4" />;
      case "video":
        return <Video className="w-4 h-4" />;
      case "image":
        return <ImageIcon className="w-4 h-4" />;
      case "audio":
        return <Music4 className="w-4 h-4" />;
      case "webpage":
        return <Globe className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getAssetIconClassName = (asset: Asset) => {
    switch (asset.kind) {
      case "pdf":
        return "bg-red-50 text-red-500";
      case "video":
        return "bg-blue-50 text-blue-500";
      case "image":
        return "bg-emerald-50 text-emerald-500";
      case "audio":
        return "bg-amber-50 text-amber-500";
      case "webpage":
        return "bg-violet-50 text-violet-500";
      default:
        return "bg-slate-100 text-slate-500";
    }
  };

  return (
    <>
      <input
        ref={assetInputRef}
        type="file"
        accept={WORKSPACE_UPLOAD_ACCEPT}
        className="hidden"
        onChange={handleAssetSelected}
      />

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-20 right-3 z-[1000] flex h-9 w-9 items-center justify-center rounded-full border bg-white p-0 text-slate-600 shadow-lg transition-all hover:bg-indigo-50 hover:text-indigo-600 group"
        title="Asset Library"
      >
        <Library className="w-5 h-5 group-hover:scale-110 transition-transform" />
      </button>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            data-no-canvas-gesture="true"
            onPointerMoveCapture={(event) => {
              const drag = touchDragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) {
                drag.moved = true;
                setTouchDragPreview({ assetId: drag.asset.id, x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY, width: drag.width, height: drag.height });
              }
              event.stopPropagation();
            }}
            onPointerUpCapture={(event) => {
              const drag = touchDragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              touchDragRef.current = null;
              setTouchDragPreview(null);
              event.stopPropagation();
              const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
              const droppedOnCanvas = !!dropTarget?.closest('[data-workspace-canvas="true"]');
              if (drag.moved && droppedOnCanvas) {
                window.dispatchEvent(new CustomEvent("workspace-asset-touch-drop", {
                  detail: { asset: drag.asset, clientX: event.clientX, clientY: event.clientY },
                }));
              }
            }}
            onPointerCancelCapture={(event) => {
              if (touchDragRef.current?.pointerId === event.pointerId) touchDragRef.current = null;
              setTouchDragPreview(null);
              event.stopPropagation();
            }}
            className="fixed top-[4.5rem] right-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] w-[min(20rem,calc(100vw-1.5rem))] sm:right-4 sm:top-[4.5rem] sm:bottom-4 sm:w-80 bg-white shadow-2xl border rounded-2xl z-[1001] flex min-h-0 flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 p-4 border-b flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 min-w-0">
                <Library className="w-4 h-4 text-indigo-500 shrink-0" />
                <h3 className="font-bold text-slate-800 truncate">Vault</h3>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <div className="relative" ref={addMenuRef}>
                  <button
                    onClick={() => setShowAddMenu((current) => !current)}
                    disabled={isUploadingAsset || isSavingLink}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-indigo-50 text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Add or upload resource"
                  >
                    {isUploadingAsset || isSavingLink ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                  </button>

                  {showAddMenu ? (
                    <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                      <button
                        type="button"
                        onClick={handlePickUpload}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <Upload className="w-4 h-4 text-indigo-600" />
                        Upload file
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowLinkForm(true);
                          setShowAddMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <Link2 className="w-4 h-4 text-slate-500" />
                        Add link
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-slate-200 rounded-md text-slate-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {showLinkForm ? (
              <div className="border-b bg-slate-50/70 p-3">
                <div className="space-y-2">
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(event) => setLinkUrl(event.target.value)}
                    placeholder="Paste YouTube, image, audio, video, PDF, or webpage URL"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-shadow focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
                  />
                  <input
                    type="text"
                    value={linkTitle}
                    onChange={(event) => setLinkTitle(event.target.value)}
                    placeholder="Optional custom title"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-shadow focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setShowLinkForm(false);
                          setLinkUrl("");
                          setLinkTitle("");
                        }}
                        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLinkSaved()}
                        disabled={isSavingLink}
                        className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Save Link
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Search */}
            <div className="shrink-0 px-3 pt-3 pb-2 border-b">
              <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Vault">
                {(["board", "library"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={tab === value}
                    onClick={() => setTab(value)}
                    className={`rounded-md py-1.5 text-xs font-medium transition-colors ${tab === value ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    {value === "board" ? "This board" : "Library"}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Find any page or file"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-shadow"
                />
              </div>
              <div className="mt-2 flex gap-1.5" role="group" aria-label="Show">
                {(["all", "pages", "resources"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={kindFilter === value}
                    onClick={() => setKindFilter(value)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${kindFilter === value ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:text-slate-700"}`}
                  >
                    {value === "all" ? "All" : value === "pages" ? "Pages" : "Resources"}
                  </button>
                ))}
              </div>
            </div>

            {/* Asset List */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-0.5">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-400 font-medium tracking-wide">FETCHING ASSETS...</p>
                </div>
              ) : (
                <>
                  {tab === "board" ? (
                    <>
                      {kindFilter === "resources" ? (
                        boardAllResources.length ? boardAllResources.map((asset) => renderAssetRow(asset, undefined, false)) : (
                          <p className="px-2 py-3 text-xs text-slate-400">Resources of the pages on this board show up here.</p>
                        )
                      ) : (
                        <>
                          {boardPages.filter((page) => matches(page.title) || resourcesOfPage(page.noteId).some((asset) => matches(asset.title))).map((page) => {
                            const resources = showResources ? resourcesOfPage(page.noteId).filter((asset) => matches(asset.title) || matches(page.title)) : [];
                            const collapsed = collapsedPages.has(page.noteId);
                            return (
                              <div key={page.noteId}>
                                <div className="flex min-h-[36px] items-center gap-1 rounded-lg px-1 hover:bg-slate-50">
                                  <button
                                    type="button"
                                    aria-label={collapsed ? `Show resources of ${page.title}` : `Hide resources of ${page.title}`}
                                    aria-expanded={!collapsed}
                                    disabled={resources.length === 0}
                                    onClick={() => setCollapsedPages((current) => {
                                      const next = new Set(current);
                                      if (next.has(page.noteId)) next.delete(page.noteId);
                                      else next.add(page.noteId);
                                      return next;
                                    })}
                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-700 disabled:opacity-30"
                                  >
                                    {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => useNotePanelStore.getState().open(page.noteId)}
                                    className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                                    title="Open the page"
                                  >
                                    <StickyNote className="h-4 w-4 shrink-0 text-violet-500" />
                                    <span className="truncate text-[13px] font-medium text-slate-800">{page.title}</span>
                                  </button>
                                  {resources.length ? <span className="shrink-0 px-1 text-[11px] text-slate-400">{resources.length}</span> : null}
                                </div>
                                {!collapsed && resources.length ? (
                                  <div className="ml-4 border-l border-slate-100 pl-2">{resources.map((asset) => renderAssetRow(asset, page.title, false))}</div>
                                ) : null}
                              </div>
                            );
                          })}
                          {boardPages.length === 0 ? (
                            <p className="px-2 py-3 text-xs text-slate-400">No pages on this board yet. Add one from the Library tab.</p>
                          ) : null}
                          {showResources && boardOnlyAssets.filter((asset) => matches(asset.title)).length ? (
                            <>
                              <p className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Only on this board</p>
                              {boardOnlyAssets.filter((asset) => matches(asset.title)).map((asset) => renderAssetRow(asset, undefined, false))}
                            </>
                          ) : null}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {showPages ? libraryPages.map((page) => (
                        <div key={page.id} className="flex min-h-[36px] items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-slate-50">
                          <StickyNote className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">{page.title || "Untitled"}</span>
                          <button
                            type="button"
                            title="Add this page to the board"
                            aria-label={`Add ${page.title || "Untitled"} to the board`}
                            onClick={() => void addPage(page.id)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      )) : null}
                      {showResources ? libraryAssets.map((asset) => renderAssetRow(asset, undefined, true)) : null}
                      {(showPages ? libraryPages.length : 0) + (showResources ? libraryAssets.length : 0) === 0 ? (
                        <p className="px-2 py-3 text-xs text-slate-400">{searchQuery ? "Nothing matches." : "Everything you have is already on this board."}</p>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </div>

            <p className="shrink-0 border-t bg-slate-50 px-4 py-2 text-[11px] leading-snug text-slate-500">
              Drag a resource onto the board. Add a page with <b>+</b> in the Library tab; its PDFs, videos and links come with it.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
