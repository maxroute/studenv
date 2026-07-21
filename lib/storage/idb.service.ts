import { openDB, IDBPDatabase } from "idb";

const DB_NAME = "second-brain-spatial-cache";
const DB_VERSION = 1;

interface SpatialCacheSchema {
  "media-cache": {
    key: string;
    value: {
      key: string;
      blob: Blob;
      mimeType: string;
      timestamp: number;
    };
  };
  "render-cache": {
    key: string;
    value: {
      key: string;
      data: any;
      timestamp: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<SpatialCacheSchema>> | null = null;

function getDB() {
  if (typeof window === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB<SpatialCacheSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("media-cache", { keyPath: "key" });
        db.createObjectStore("render-cache", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

export async function getMedia(key: string) {
  const db = await getDB();
  if (!db) return null;
  return db.get("media-cache", key);
}

export async function putMedia(key: string, blob: Blob, mimeType: string) {
  const db = await getDB();
  if (!db) return;
  await db.put("media-cache", {
    key,
    blob,
    mimeType,
    timestamp: Date.now(),
  });
}

export async function getRenderData(key: string) {
  const db = await getDB();
  if (!db) return null;
  return db.get("render-cache", key);
}

export async function putRenderData(key: string, data: any) {
  const db = await getDB();
  if (!db) return;
  await db.put("render-cache", {
    key,
    data,
    timestamp: Date.now(),
  });
}

export async function clearOldCache(maxAgeMs = 1000 * 60 * 60 * 24 * 7) {
  const db = await getDB();
  if (!db) return;
  const now = Date.now();
  
  // This is a simplified cleanup
  const tx = db.transaction(["media-cache", "render-cache"], "readwrite");
  // Logic to iterate and delete would go here
  await tx.done;
}
