export type AuthSyncEvent = "email-verified" | "password-reset";

const AUTH_SYNC_CHANNEL = "studenv:auth-sync";

export function publishAuthSyncEvent(type: AuthSyncEvent) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return;
  }

  try {
    const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
    channel.postMessage({ type, timestamp: Date.now() });
    channel.close();
  } catch {
    // Cross-tab sync is a progressive enhancement; the current tab still completes its flow.
  }
}

export function subscribeToAuthSync(
  listener: (type: AuthSyncEvent) => void,
) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => undefined;
  }

  let channel: BroadcastChannel;

  try {
    channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
  } catch {
    return () => undefined;
  }

  const handleMessage = (event: MessageEvent<{ type?: unknown }>) => {
    if (event.data?.type === "email-verified" || event.data?.type === "password-reset") {
      listener(event.data.type);
    }
  };

  channel.addEventListener("message", handleMessage);
  return () => {
    channel.removeEventListener("message", handleMessage);
    channel.close();
  };
}
