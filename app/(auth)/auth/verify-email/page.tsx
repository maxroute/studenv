"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetcher } from "@/lib/client/fetcher";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const initialEmail = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    token ? "loading" : "idle",
  );
  const [message, setMessage] = useState(
    initialEmail
      ? `We sent a verification link to ${initialEmail}.`
      : "Enter your email address to request a verification link.",
  );
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(initialEmail && !token ? 60 : 0);

  useEffect(() => {
    if (!countdown) return;
    const timer = window.setInterval(() => {
      setCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        await apiFetcher(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        setStatus("done");
        setMessage("Your email has been verified successfully. You can now sign in to your account.");
      } catch (error) {
        setStatus("error");
        setMessage((error as Error).message || "This verification link is invalid or has expired. You can request a new one below.");
      }
    })();
  }, [token]);

  async function handleResend() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || resending || countdown > 0) return;

    setResending(true);
    try {
      await apiFetcher("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail }),
      });
      setMessage("If an unverified account exists for that email, a new verification link has been sent. Check your inbox and Spam/Junk folder.");
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
        <p className="auth-sub">{status === "loading" ? "Verifying..." : message}</p>
        {status !== "done" ? (
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
            <p className="field-hint">
              Check your inbox. If the email isn't there, look in your Spam or Junk folder.
              Verification links expire after 1 hour.
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
        <Link className="btn-primary" href="/auth/login">
          Go to Sign In
        </Link>
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
