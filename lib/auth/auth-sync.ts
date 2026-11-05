export type AuthSyncEvent = "email-verified" | "password-reset";

const AUTH_SYNC_CHANNEL = "studenv:auth-sync";
const AUTH_SYNC_STORAGE_KEY = "studenv:auth-sync:last-event";
const RECENT_EVENT_TTL_MS = 10 * 60 * 1000;

type StoredAuthSyncEvent = {
  type: AuthSyncEvent;
  timestamp: number;
};

function readRecentStoredEvent(): AuthSyncEvent | null {
  try {
    const raw = window.localStorage.getItem(AUTH_SYNC_STORAGE_KEY);
    if (!raw) return null;
    const event = JSON.parse(raw) as Partial<StoredAuthSyncEvent>;
    if (
      (event.type !== "email-verified" && event.type !== "password-reset") ||
      typeof event.timestamp !== "number" ||
      Date.now() - event.timestamp > RECENT_EVENT_TTL_MS ||
      event.timestamp > Date.now()
    ) {
      window.localStorage.removeItem(AUTH_SYNC_STORAGE_KEY);
      return null;
    }
    return event.type;
  } catch {
    return null;
  }
}

export function publishAuthSyncEvent(type: AuthSyncEvent) {
  if (typeof window === "undefined") return;

  const payload: StoredAuthSyncEvent = { type, timestamp: Date.now() };

  // Persist briefly so a tab that is refreshed after the action can still
  // recover the completion state. This marker contains no credentials/tokens.
  try {
    window.localStorage.setItem(AUTH_SYNC_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be unavailable; BroadcastChannel remains a fallback.
  }

  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // Cross-tab sync is a progressive enhancement.
  }
}

export function subscribeToAuthSync(
  listener: (type: AuthSyncEvent) => void,
) {
  if (typeof window === "undefined") return () => undefined;

  // Recover a recent completion after a page reload.
  const recentEvent = readRecentStoredEvent();
  if (recentEvent) listener(recentEvent);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_SYNC_STORAGE_KEY || !event.newValue) return;
    try {
      const payload = JSON.parse(event.newValue) as Partial<StoredAuthSyncEvent>;
      if (payload.type === "email-verified" || payload.type === "password-reset") {
        listener(payload.type);
      }
    } catch {
      // Ignore malformed cross-tab messages.
    }
  };
  window.addEventListener("storage", handleStorage);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
      channel.addEventListener("message", (event: MessageEvent<{ type?: unknown }>) => {
        if (event.data?.type === "email-verified" || event.data?.type === "password-reset") {
          listener(event.data.type);
        }
      });
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener("storage", handleStorage);
    channel?.close();
  };
}
