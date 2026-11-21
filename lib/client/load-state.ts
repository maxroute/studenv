/**
 * What a list that loads from the server should show. "Empty" is only true
 * when the server said so: a request still in flight, or one that failed
 * before anything arrived, is not an empty list.
 */
export type LoadState = "loading" | "failed" | "empty" | "ready";

export function loadState(input: { hasData: boolean; count: number; isLoading: boolean; error: unknown }): LoadState {
  if (input.hasData) return input.count > 0 ? "ready" : "empty";
  // Without data, a first request that failed is shown as such, not as nothing here.
  return input.error ? "failed" : "loading";
}

/** Waits between automatic retries: 1 s, 2 s, 4 s, then 8 s at most. */
export function retryDelay(retryCount: number) {
  return Math.min(8_000, 1_000 * 2 ** Math.max(0, retryCount));
}

/** A request is worth repeating when it never reached the server, or the server failed (not when it said no). */
export function shouldRetry(error: unknown, retryCount: number, maxRetries = 6) {
  if (retryCount >= maxRetries) return false;
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  if (typeof status !== "number") return true;
  return status >= 500 || status === 408;
}
