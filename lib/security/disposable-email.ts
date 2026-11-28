import disposableDomains from "@/lib/security/data/disposable-email-domains.json";
import { ValidationHttpError } from "@/lib/security/validate";

/**
 * Disposable (temporary) inbox domains, vendored from the CC0
 * disposable-email-domains list. See lib/security/data/README.md for the
 * source and how to refresh it. Server-only: the list is ~180 KB, so keep it
 * out of client bundles.
 */
const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set(disposableDomains);

export const DISPOSABLE_EMAIL_MESSAGE =
  "Please use a permanent email address — temporary inboxes can't be used for Studenv.";

/** The domain part of an address, lower-cased, without surrounding spaces or trailing dots. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  return domain || null;
}

/**
 * True when the domain, or any parent domain of it, is a known disposable
 * inbox provider: `mailinator.com` and `x.mailinator.com` both match.
 */
export function isDisposableDomain(domain: string): boolean {
  let candidate = domain.trim().toLowerCase().replace(/\.+$/, "");

  while (candidate.includes(".")) {
    if (DISPOSABLE_DOMAINS.has(candidate)) return true;
    candidate = candidate.slice(candidate.indexOf(".") + 1);
  }

  return false;
}

export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  return domain !== null && isDisposableDomain(domain);
}

/**
 * Rejects a disposable address with a friendly 400 that the sign-up and
 * settings screens show as-is. Only call it for a new account or a changed
 * email, never for an address an existing account already has.
 */
export function assertNotDisposableEmail(email: string): void {
  if (isDisposableEmail(email)) {
    throw new ValidationHttpError(DISPOSABLE_EMAIL_MESSAGE, 400, {
      issues: [{ path: "email", message: DISPOSABLE_EMAIL_MESSAGE }],
    });
  }
}
