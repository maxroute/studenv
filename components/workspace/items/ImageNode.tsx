"use client";

import { ImageNode as ImageNodeType } from "@/types/workspace";
import { Image as ImageIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
      key={activeSource}
      src={activeSource}
      alt={alt}
      className="drag-handle block h-full w-full cursor-move select-none object-contain"
      draggable={false}
      onLoad={(event) => {
        const loadedImage = event.currentTarget;
        if (!loadedImage.naturalWidth || !loadedImage.naturalHeight) return;

        const sourceKey = loadedImage.currentSrc || activeSource;
        if (appliedNaturalSizeRef.current === sourceKey) return;
        appliedNaturalSizeRef.current = sourceKey;

        const naturalSize = fitImageToBounds(
          loadedImage.naturalWidth,
          loadedImage.naturalHeight,
          item.w,
          item.h,
        );
        if (Math.abs(naturalSize.w - item.w) > 1 || Math.abs(naturalSize.h - item.h) > 1) {
          useWorkspaceStore.getState().updateItem(item.id, naturalSize);
        }
      }}
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
