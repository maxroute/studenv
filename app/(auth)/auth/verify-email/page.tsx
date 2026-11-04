"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { apiFetcher } from "@/lib/client/fetcher";
import { publishAuthSyncEvent } from "@/lib/auth/auth-sync";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const initialEmail = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState(
    token
      ? "Click below to verify your email address."
      : "Enter your email to receive a verification link.",
  );
  const [resending, setResending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const verificationInFlight = useRef(false);
  const verifiedToken = useRef<string | null>(null);

  useEffect(() => {
    if (!countdown) return;
    const timer = window.setInterval(() => {
      setCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  async function handleVerify() {
    if (
      !token ||
      verificationInFlight.current ||
      verifiedToken.current === token ||
      status === "done"
    ) return;

    // State updates are asynchronous. Lock synchronously so rapid clicks
    // cannot submit the same one-time token more than once.
    verificationInFlight.current = true;
    setVerifying(true);
    setStatus("loading");
    try {
      await apiFetcher("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      verifiedToken.current = token;
      publishAuthSyncEvent("email-verified");
      setStatus("done");
      setMessage("Your email has been verified. You can sign in now.");
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message || "This verification link is invalid or expired.");
    } finally {
      verificationInFlight.current = false;
      setVerifying(false);
    }
  }

  async function handleResend() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || resending || countdown > 0) return;

    setResending(true);
    try {
      await apiFetcher("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail }),
      });
      setMessage("If your account needs verification, we'll send a new link.");
      setCountdown(60);
    } catch (error) {
      const apiError = error as Error & { details?: { retryAfter?: number } };
      const wait = apiError.details?.retryAfter;
      if (wait) setCountdown(wait);
      setMessage(apiError.message || "We couldn't send the email. Please try again shortly.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="simple-auth-page">
      <div className="simple-auth-card">
        <div className="auth-title">
          Verify your <em>email</em>
        </div>
        <p className="auth-sub verify-email-message">
          {status === "loading" ? "Verifying your email address..." : message}
        </p>

        {status !== "done" && token && status !== "error" ? (
          <button
            className="btn-primary"
            type="button"
            onClick={handleVerify}
            disabled={verifying}
          >
            {verifying ? "Verifying..." : "Verify email address"}
          </button>
        ) : null}

        {status !== "done" && (!token || status === "error") ? (
          <div className="auth-fields">
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <p className="field-hint verify-email-instructions">
              Enter your email to request another link. Check your inbox or spam folder.
            </p>
            <button
              className="btn-primary"
              type="button"
              onClick={handleResend}
              disabled={!email.trim() || resending || countdown > 0}
            >
              {resending
                ? "Sending..."
                : countdown > 0
                  ? `Resend available in ${countdown}s`
                  : "Resend verification email"}
            </button>
          </div>
        ) : null}

        {status === "done" ? (
          <Link className="btn-primary verify-email-signin" href="/auth/signin" target="_self">
            Go to Sign In
          </Link>
        ) : (
          <Link className="verify-email-signin" href="/auth/signin" target="_self">
            Back to Sign In
          </Link>
        )}
      </div>
    </div>
  );
}
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="simple-auth-page" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
