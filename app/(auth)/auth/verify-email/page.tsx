"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetcher } from "@/lib/client/fetcher";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    token ? "loading" : "idle",
  );
  const [message, setMessage] = useState(
    email
      ? `We sent a verification link to ${email}.`
      : "Check your inbox for the verification link.",
  );

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        await apiFetcher(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        setStatus("done");
        setMessage("Your email is verified. You can sign in now.");
      } catch (error) {
        setStatus("error");
        setMessage((error as Error).message);
      }
    })();
  }, [token]);

  return (
    <div className="simple-auth-page">
      <div className="simple-auth-card">
        <div className="auth-title">
          Verify your <em>email</em>
        </div>
        <p className="auth-sub">{status === "loading" ? "Verifying..." : message}</p>
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
