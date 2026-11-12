"use client";

import { ImageNode as ImageNodeType } from "@/types/workspace";
import { Image as ImageIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { fitImageToBounds } from "@/lib/workspace/image-sizing";

interface ImageNodeProps {
  item: ImageNodeType;
}

export function ImageNode({ item }: ImageNodeProps) {
  const initialCandidates = useMemo(
    () => [item.props.src].filter((value): value is string => Boolean(value && value.trim())),
    [item.props.src],
  );
  const [sources, setSources] = useState<string[]>(initialCandidates);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [alt, setAlt] = useState(item.props.alt ?? "Image");
  const appliedNaturalSizeRef = useRef<string | null>(null);
  const imageElementRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    appliedNaturalSizeRef.current = null;
  }, [item.id, item.props.assetId, item.props.src]);

  useEffect(() => {
    setSources(initialCandidates);
    setSourceIndex(0);
  }, [initialCandidates]);

  useEffect(() => {
    let active = true;

    const loadAssetDetails = async () => {
      if (!item.props.assetId) {
        setAlt(item.props.alt ?? "Image");
        return;
      }

      try {
        const response = await fetch(`/api/assets/${item.props.assetId}`);
        if (!response.ok) {
          throw new Error("Failed to load image asset");
        }

        const asset = await response.json();
        if (!active) return;

        const fallbackSources = [
          item.props.src,
          asset.contentUrl,
          asset.sourceUrl,
          `/api/assets/${item.props.assetId}/content`,
        ].filter((value): value is string => Boolean(value && value.trim()));

        setSources([...new Set(fallbackSources)]);
        setSourceIndex(0);
        setAlt(asset.title || item.props.alt || "Image");
      } catch (error) {
        console.warn("Failed to load image asset details", error);
        if (!active) return;

        const fallbackSources = [
          item.props.src,
          `/api/assets/${item.props.assetId}/content`,
        ].filter((value): value is string => Boolean(value && value.trim()));

        setSources([...new Set(fallbackSources)]);
        setSourceIndex(0);
        setAlt(item.props.alt ?? "Image");
      }
    };

    void loadAssetDetails();

    return () => {
      active = false;
    };
  }, [item.props.alt, item.props.assetId, item.props.src]);

  const activeSource = sources[sourceIndex] ?? "";

  const syncNaturalSize = useCallback(() => {
    const loadedImage = imageElementRef.current;
    if (!loadedImage?.complete || !loadedImage.naturalWidth || !loadedImage.naturalHeight) return;

    const sourceKey = loadedImage.currentSrc || activeSource;
    if (appliedNaturalSizeRef.current === sourceKey) return;

    // Read the latest persisted bounds rather than the render-time item prop.
    // This keeps the selection overlay and image geometry synchronized even
    // when the image finishes loading after the item has already changed.
    const currentItem = useWorkspaceStore.getState().items.find((candidate) => candidate.id === item.id);
    if (!currentItem) return;

    const naturalSize = fitImageToBounds(
      loadedImage.naturalWidth,
      loadedImage.naturalHeight,
      currentItem.w,
      currentItem.h,
    );
    appliedNaturalSizeRef.current = sourceKey;

    if (Math.abs(naturalSize.w - currentItem.w) > 1 || Math.abs(naturalSize.h - currentItem.h) > 1) {
      useWorkspaceStore.getState().updateItem(item.id, naturalSize, { recordHistory: false });
    }
  }, [activeSource, item.id]);

  // Cached images may already be complete by the time React attaches onLoad.
  // Check the element after each source change as well as handling the event.
  useEffect(() => {
    syncNaturalSize();
  }, [syncNaturalSize]);

  if (!activeSource) {
    return (
      <div className="drag-handle flex h-full w-full cursor-move flex-col items-center justify-center gap-2 bg-slate-100 text-slate-400">
        <ImageIcon className="h-8 w-8" />
        <p className="px-4 text-center text-xs font-medium">Image unavailable</p>
      </div>
    );
  }

  return (
    <img
      ref={imageElementRef}
      key={activeSource}
      src={activeSource}
      alt={alt}
      className="drag-handle block h-full w-full cursor-move select-none object-contain"
      draggable={false}
      onLoad={syncNaturalSize}
      onError={() => {
        setSourceIndex((current) => {
          if (current < sources.length - 1) {
            return current + 1;
          }

          return current;
        });
      }}
    />
  );
}
