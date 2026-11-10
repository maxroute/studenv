"use client";

import { useState, useEffect, useRef } from "react";
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
  Trash2
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

interface Asset {
  id: string;
  title: string;
  kind: "pdf" | "video" | "image" | "audio" | "webpage" | "snapshot";
  currentRevisionId: string | null;
  mimeType: string | null;
}

type DrawerScope = "workspace" | "all";


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
  const [scope, setScope] = useState<DrawerScope>("workspace");
  const assetInputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const touchDragRef = useRef<{ asset: Asset; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const workspaceItems = useWorkspaceStore((state) => state.items);
  const workspaceCoverAssetId = useWorkspaceStore((state) => state.coverAssetId);
  const workspaceAssetIdsFromStore = useWorkspaceStore((state) => state.workspaceAssetIds);
  const registerWorkspaceAsset = useWorkspaceStore((state) => state.registerWorkspaceAsset);
  const unregisterWorkspaceAsset = useWorkspaceStore((state) => state.unregisterWorkspaceAsset);
  const updateItems = useWorkspaceStore((state) => state.updateItems);

  useEffect(() => {
    if (isOpen) {
      void fetchAssets();
    }
  }, [isOpen]);

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
  const scopedAssets = filteredAssets.filter((asset) =>
    scope === "all" ? true : workspaceAssetIds.has(asset.id),
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
              }
              event.stopPropagation();
            }}
            onPointerUpCapture={(event) => {
              const drag = touchDragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              touchDragRef.current = null;
              event.stopPropagation();
              if (drag.moved) {
                window.dispatchEvent(new CustomEvent("workspace-asset-touch-drop", {
                  detail: { asset: drag.asset, clientX: event.clientX, clientY: event.clientY },
                }));
              }
            }}
            onPointerCancelCapture={(event) => {
              if (touchDragRef.current?.pointerId === event.pointerId) touchDragRef.current = null;
              event.stopPropagation();
            }}
            className="fixed top-[4.5rem] right-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] w-[min(20rem,calc(100vw-1.5rem))] sm:right-4 sm:top-[4.5rem] sm:bottom-4 sm:w-80 bg-white shadow-2xl border rounded-2xl z-[1001] flex min-h-0 flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 p-4 border-b flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 min-w-0">
                <Library className="w-4 h-4 text-indigo-500 shrink-0" />
                <h3 className="font-bold text-slate-800 truncate">Vault Library</h3>
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
            <div className="shrink-0 p-3 border-b">
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${scope === "workspace"
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                    }`}
                  type="button"
                  onClick={() => setScope("workspace")}
                >
                  This Workspace
                </button>
                <button
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${scope === "all"
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                    }`}
                  type="button"
                  onClick={() => setScope("all")}
                >
                  All Assets
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search your assets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-shadow"
                />
              </div>
            </div>

            {/* Asset List */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 space-y-2">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-400 font-medium tracking-wide">FETCHING ASSETS...</p>
                </div>
              ) : scopedAssets.length > 0 ? (
                scopedAssets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable
                    style={{ touchAction: "none" }}
                    onPointerDown={(event) => {
                      if (event.pointerType !== "touch") return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      touchDragRef.current = {
                        asset,
                        pointerId: event.pointerId,
                        startX: event.clientX,
                        startY: event.clientY,
                        moved: false,
                      };
                    }}
                    onPointerMove={(event) => {
                      const drag = touchDragRef.current;
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) {
                        drag.moved = true;
                      }
                    }}
                    onPointerUp={(event) => {
                      const drag = touchDragRef.current;
                      if (!drag || drag.pointerId !== event.pointerId) return;
                      touchDragRef.current = null;
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                      if (drag.moved) {
                        window.dispatchEvent(new CustomEvent("workspace-asset-touch-drop", {
                          detail: { asset: drag.asset, clientX: event.clientX, clientY: event.clientY },
                        }));
                      }
                    }}
                    onPointerCancel={(event) => {
                      if (touchDragRef.current?.pointerId === event.pointerId) {
                        touchDragRef.current = null;
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
                    className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-500/5 transition-all cursor-grab active:cursor-grabbing group"
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${getAssetIconClassName(asset)}`}>
                      {renderAssetIcon(asset)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 truncate group-hover:text-slate-900">
                        {asset.title}
                      </p>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight flex items-center gap-1.5">
                        {asset.kind === "webpage" ? <Globe className="w-3 h-3" /> : null}
                        {getAssetKindLabel(asset.kind)}
                      </p>
                    </div>
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
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 transition-colors shrink-0" />
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-60 text-center px-6">
                  <Library className="w-10 h-10 text-slate-200 mb-4" />
                  <p className="text-sm text-slate-500 font-medium">No assets found</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {scope === "workspace"
                      ? "This workspace has not uploaded or used any vault resources yet."
                      : "Upload files or save links to see them here."}
                  </p>
                </div>
              )}
            </div>

            {/* Footer / Tip */}
            <div className="shrink-0 p-4 bg-slate-50 border-t">
              <div className="flex items-start gap-3">
                <div className="p-1.5 bg-indigo-50 rounded text-indigo-600">
                  <Plus className="w-3 h-3" />
                </div>
                <div className="text-[11px] text-slate-500 leading-normal">
                  <p><b>Pro Tip:</b> Upload PDFs, images, videos, or audio here, then drag them into the workspace.</p>
                  <p className="mt-1 text-slate-400">The vault now uses one shared library flow for multiple resource types.</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
