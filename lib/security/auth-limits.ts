// ---------------------------------------------------------------------------
// Which limit an auth request counts against, and what to tell the person
// ---------------------------------------------------------------------------
//
// Pure: runs in middleware (Edge) and in tests.
//
// Each auth step has its own limit, so a new user signing up, verifying and
// asking for one more email can't run out on a step they haven't reached.
// Steps that also check per email address (resend, forgot password) and
// change password are limited in their routes only, so nothing counts twice.
// Sign-in itself has its own lockout on wrong passwords (auth.service).

/** Auth steps limited per network address in middleware. */
export type AuthIpBucket = "signup" | "verify-email" | "reset-password";

export function authIpBucket(pathname: string, method: string): AuthIpBucket | null {
  if (method !== "POST") return null;
  if (pathname === "/api/auth/signup") return "signup";
  if (pathname === "/api/auth/verify-email") return "verify-email";
  if (pathname === "/api/auth/reset-password") return "reset-password";
  return null;
}

/** "Too many attempts. Try again in 12 minutes." from when the limit resets. */
export function retryMessage(resetAt: number, now: number, what = "attempts"): string {
  const seconds = Math.max(0, Math.ceil((resetAt - now) / 1000));
  if (!Number.isFinite(seconds) || seconds === 0) return `Too many ${what}. Please try again shortly.`;
  if (seconds < 60) return `Too many ${what}. Try again in a minute.`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `Too many ${what}. Try again in ${minutes} minutes.`;
  const hours = Math.ceil(minutes / 60);
  return `Too many ${what}. Try again in ${hours === 1 ? "an hour" : `${hours} hours`}.`;
}
