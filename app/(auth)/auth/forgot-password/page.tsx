"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { apiFetcher } from "@/lib/client/fetcher";
import { subscribeToAuthSync } from "@/lib/auth/auth-sync";

function ForgotPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => subscribeToAuthSync((event) => {
    if (event === "password-reset") {
      router.replace("/auth/signin?reset=1");
      router.refresh();
    }
  }), [router]);

  async function handleSubmit() {
    if (sending || !email.trim()) return;
    setSending(true);
    try {
      await apiFetcher("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
      toast.success("If the account exists, reset instructions were sent.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="simple-auth-page">
      <form
        className="simple-auth-card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <div className="auth-title">
          Reset your <em>password</em>
        </div>
        <p className="auth-sub">
          {sent
            ? "Check your inbox for a reset link."
            : "Enter your email and we’ll send reset instructions."}
        </p>
        {!sent ? (
          <>
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <button className="btn-primary" type="submit" disabled={sending || !email.trim()}>
              {sending ? "Sending..." : "Send Reset Link"}
            </button>
          </>
        ) : null}
        <Link href="/auth/signin" target="_self">Back to sign in</Link>
      </form>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="simple-auth-page" />}>
      <ForgotPasswordContent />
    </Suspense>
  );
}
