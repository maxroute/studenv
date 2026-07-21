"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import toast from "react-hot-toast";
import { apiFetcher } from "@/lib/client/fetcher";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    try {
      await apiFetcher("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      setDone(true);
      toast.success("Password reset complete.");
    } catch (error) {
      toast.error((error as Error).message);
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
            <button className="btn-primary" type="button" onClick={handleSubmit}>
              Reset Password
            </button>
          </>
        ) : (
          <Link className="btn-primary" href="/auth/login">
            Sign In
          </Link>
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
