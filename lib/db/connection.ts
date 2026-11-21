/**
 * Database connection helpers, kept free of Prisma so they can be tested.
 *
 * A Neon database that has been idle can take several seconds to wake. Prisma's
 * default 5 s connect timeout turns that into a failed first request.
 */

export const CONNECT_TIMEOUT_SECONDS = 20;

/** The URL with a longer connect timeout, unless it already sets one. Returns the input if it is not a URL. */
export function withConnectTimeout(url: string | undefined, seconds = CONNECT_TIMEOUT_SECONDS) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connect_timeout")) parsed.searchParams.set("connect_timeout", String(seconds));
    return parsed.toString();
  } catch {
    return url;
  }
}

/** True for errors that mean "could not reach the database", which a retry can fix. */
export function isConnectionError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string" && ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(code)) return true;
  return typeof message === "string" && /can't reach database server|connection (terminated|closed|timed out)|ECONNRESET|ETIMEDOUT/i.test(message);
}

/** Runs `probe` until it works: a few tries with short waits, then the last error. */
export async function waitUntilReady(probe: () => Promise<unknown>, options: { attempts?: number; waitMs?: number; sleep?: (ms: number) => Promise<void> } = {}) {
  const { attempts = 3, waitMs = 800, sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) } = options;
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await probe();
      return;
    } catch (error) {
      last = error;
      if (!isConnectionError(error)) throw error;
      if (attempt < attempts - 1) await sleep(waitMs * (attempt + 1));
    }
  }
  throw last;
}
