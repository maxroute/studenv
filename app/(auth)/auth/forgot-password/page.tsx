"use client";

import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";
import { apiFetcher } from "@/lib/client/fetcher";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    try {
      await apiFetcher("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
      toast.success("If the account exists, reset instructions were sent.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="simple-auth-page">
      <div className="simple-auth-card">
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
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <button className="btn-primary" type="button" onClick={handleSubmit}>
              Send Reset Link
            </button>
          </>
        ) : null}
        <Link href="/auth/signin">Back to sign in</Link>
      </div>
    </div>
  );
}
