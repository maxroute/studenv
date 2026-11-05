export type AuthSyncEvent = "email-verified" | "password-reset";

const AUTH_SYNC_CHANNEL = "studenv:auth-sync";
const AUTH_SYNC_STORAGE_KEY = "studenv:auth-sync:event";

type StoredAuthSyncEvent = {
  type: AuthSyncEvent;
  timestamp: number;
};

function isAuthSyncEvent(value: unknown): value is AuthSyncEvent {
  return value === "email-verified" || value === "password-reset";
}

function canUseLocalStorage() {
  try {
    window.localStorage.getItem(AUTH_SYNC_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function publishAuthSyncEvent(type: AuthSyncEvent) {
  if (typeof window === "undefined") return;

  const payload: StoredAuthSyncEvent = { type, timestamp: Date.now() };

  // Use exactly one transport. Writing to localStorage notifies other tabs,
  // but does not notify this tab. We intentionally never replay old values
  // when a page mounts: completion events are live signals, not app state.
  try {
    window.localStorage.setItem(
      AUTH_SYNC_STORAGE_KEY,
      JSON.stringify({ ...payload, id: `${payload.timestamp}-${Math.random()}` }),
    );
    return;
  } catch {
    // Fall back to BroadcastChannel when storage is unavailable.
  }

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
      channel.postMessage(payload);
      channel.close();
    } catch {
      // Cross-tab sync is a progressive enhancement.
    }
  }
}

export function subscribeToAuthSync(
  listener: (type: AuthSyncEvent) => void,
) {
  if (typeof window === "undefined") return () => undefined;

  if (canUseLocalStorage()) {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_SYNC_STORAGE_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue) as Partial<StoredAuthSyncEvent>;
        if (isAuthSyncEvent(payload.type)) listener(payload.type);
      } catch {
        // Ignore malformed cross-tab messages.
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
      const handleMessage = (event: MessageEvent<{ type?: unknown }>) => {
        if (isAuthSyncEvent(event.data?.type)) listener(event.data.type);
      };
      channel.addEventListener("message", handleMessage);
      return () => {
        channel.removeEventListener("message", handleMessage);
        channel.close();
      };
    } catch {
      // Cross-tab sync is a progressive enhancement.
    }
  }

  return () => undefined;
}
