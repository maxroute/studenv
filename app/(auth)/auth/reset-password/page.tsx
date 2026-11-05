"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import toast from "react-hot-toast";
import { apiFetcher } from "@/lib/client/fetcher";
import { publishAuthSyncEvent } from "@/lib/auth/auth-sync";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await apiFetcher("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      publishAuthSyncEvent("password-reset");
      setDone(true);
      toast.success("Password reset complete.");
      router.replace("/auth/signin?reset=1");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="simple-auth-page">
      <div className="simple-auth-card">
        <div className="auth-title">
          Create a new <em>password</em>
        </div>
        {!done ? (
          <>
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
            <button className="btn-primary" type="button" onClick={handleSubmit} disabled={submitting || !token}>
              {submitting ? "Resetting..." : "Reset Password"}
            </button>
          </>
        ) : (
          <>
            <p className="auth-sub" role="status">
              Your password has been reset successfully. You can now sign in with your new password.
            </p>
            <Link className="btn-primary" href="/auth/signin?reset=1" target="_self" style={{ display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="simple-auth-page" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
