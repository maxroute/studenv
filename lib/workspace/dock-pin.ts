// ---------------------------------------------------------------------------
// "Keep tools open": the phone tool dock's pin, remembered per device (pure)
// ---------------------------------------------------------------------------
//
// On a phone the tool dock collapses to the active tool every time a tool is
// picked. Pinning keeps it open. The choice is kept in the browser's storage,
// which can be missing or throw (private windows, blocked storage), so every
// access is guarded and the dock simply starts unpinned.

export const DOCK_PINNED_KEY = "studenv.board.toolsPinned";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** The browser's local storage, or null where it is missing or blocked (merely touching it can throw). */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readDockPinned(storage: StorageLike | null | undefined): boolean {
  try {
    return storage?.getItem(DOCK_PINNED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDockPinned(storage: StorageLike | null | undefined, pinned: boolean): void {
  try {
    storage?.setItem(DOCK_PINNED_KEY, pinned ? "1" : "0");
  } catch {
    // The choice just isn't remembered.
  }
}
