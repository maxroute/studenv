// ---------------------------------------------------------------------------
// Where a signed-in visitor goes instead of the home or sign-in page
// ---------------------------------------------------------------------------
//
// Pure (runs in middleware). A session lasts 7 days, but the home page and the
// sign-in form used to show regardless, so students signed in again for
// nothing. Signed in, the home page opens the dashboard, and the sign-in and
// sign-up pages go where the link was taking them.

const DEFAULT_DESTINATION = "/dashboard";
const SIGN_IN_PAGES = new Set(["/auth/signin", "/auth/signup"]);

/**
 * A same-site path to send someone to, or null. Only plain paths: not "//x"
 * or "/\x" (both mean another site to a browser), no control characters, and
 * never back into the sign-in pages.
 */
export function safeLocalPath(value: string | null | undefined): string | null {
  if (!value || value.length > 2_000) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  const path = value.split(/[?#]/)[0];
  if (SIGN_IN_PAGES.has(path) || path === "/") return null;
  return value;
}

/** Where to send a signed-in visitor of `pathname`, or null to show the page as it is. */
export function signedInRedirect(pathname: string, searchParams: URLSearchParams): string | null {
  if (pathname === "/") return DEFAULT_DESTINATION;
  if (SIGN_IN_PAGES.has(pathname)) return safeLocalPath(searchParams.get("callbackUrl")) ?? DEFAULT_DESTINATION;
  return null;
}
