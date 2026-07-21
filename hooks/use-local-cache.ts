import { useCallback } from "react";
import * as idbService from "@/lib/storage/idb.service";

export function useLocalCache() {
  const getCachedMedia = useCallback(async (key: string, fetcher: () => Promise<{ blob: Blob, mimeType: string }>) => {
    // 1. Check cache
    const cached = await idbService.getMedia(key);
    if (cached) {
      console.log(`[Cache] Hit: ${key}`);
      return cached.blob;
    }

    // 2. Fetch and Cache
    console.log(`[Cache] Miss: ${key}. Fetching...`);
    const { blob, mimeType } = await fetcher();
    await idbService.putMedia(key, blob, mimeType);
    
    return blob;
  }, []);

  const getCachedRenderData = useCallback(async (key: string, generator: () => Promise<any>) => {
    const cached = await idbService.getRenderData(key);
    if (cached) return cached.data;

    const data = await generator();
    await idbService.putRenderData(key, data);
    return data;
  }, []);

  return { getCachedMedia, getCachedRenderData };
}
