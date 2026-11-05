"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getAuthErrorMessage } from "@/lib/auth/error-message";
import { toLocalAppPath } from "@/lib/auth/local-redirect";
import { BrandLockup } from "@/components/ui/brand-logo";
import { subscribeToAuthSync } from "@/lib/auth/auth-sync";

export function SigninContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signinErrorCode, setLoginErrorCode] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationResendCooldown, setVerificationResendCooldown] = useState(0);
  const callbackUrl = toLocalAppPath(searchParams.get("callbackUrl"), "/dashboard");
  const authError = searchParams.get("error");
  const authErrorMessage = useMemo(
    () => getAuthErrorMessage(authError),
    [authError],
  );

  useEffect(() => subscribeToAuthSync((event) => {
    if (event === "email-verified") {
      setLoginErrorCode(null);
      toast.success("Email verified. You can sign in now.");
    }

    if (event === "password-reset") {
      setPassword("");
      toast.success("Password reset in another tab. Sign in with your new password.");
    }
  }), []);

  useEffect(() => {
    if (verificationResendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setVerificationResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [verificationResendCooldown]);

  useEffect(() => {
    if (authErrorMessage) {
      toast.error(authErrorMessage);
    }
  }, [authErrorMessage]);

  async function handleSignin() {
    try {
      setLoading(true);
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setLoginErrorCode(result.code ?? null);

        if (result.code === "email-not-verified") {
          return;
        }

        throw new Error(
          result.code === "account-temporarily-locked"
            ? "Too many unsuccessful sign-in attempts. Please try again later."
            : getAuthErrorMessage(result.error),
        );
      }

      setLoginErrorCode(null);
      router.push(toLocalAppPath(result?.url ?? callbackUrl, "/dashboard"));
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!email.trim() || resendingVerification || verificationResendCooldown > 0) return;

    setResendingVerification(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "We couldn't send the verification email. Please try again shortly.");
      }

      setVerificationResendCooldown(60);
      toast.success(
        "If your account needs verification, we will send a link. Recent requests may take a minute.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setResendingVerification(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-left">
        <div className="auth-brand">
          <BrandLockup
            height={32}
            imageClassName="auth-brand-mark"
            priority
            textClassName="auth-brand-logo"
            variant="badge"
            width={32}
          />
        </div>
        <div className="auth-art">
          <div className="art-card art-a">
            <div className="art-card-type">article</div>
            <div className="art-card-title">Building reliable systems under tight timelines</div>
            <div className="art-card-footer">
              <span className="art-tag">engineering</span>
              <span className="art-status reading">reading</span>
            </div>
          </div>
          <div className="art-card art-p">
            <div className="art-card-type">pdf</div>
            <div className="art-card-title">The discipline of keeping your thinking retrievable</div>
            <div className="art-card-footer">
              <span className="art-tag">research</span>
              <span className="art-status done">done</span>
            </div>
          </div>
          <div className="art-card art-n">
            <div className="art-card-type">note</div>
            <div className="art-card-title">Design references, prompts, insights, and next steps</div>
            <div className="art-card-footer">
              <span className="art-tag">product</span>
              <span className="art-status unread">unread</span>
            </div>
          </div>
        </div>
        <div className="auth-tagline">
          <div className="auth-tagline-title">
            Save what matters. Surface it <em>when it counts.</em>
          </div>
          <div className="auth-tagline-sub">
            Articles, PDFs, videos, and notes in one focused system.
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form">
          <div className="auth-title">
            Welcome <em>back</em>
          </div>
          <div className="auth-sub">
            New here? <Link href="/auth/signup">Create your account</Link>
          </div>
          {searchParams.get("verified") === "1" ? (
            <div className="auth-success" role="status">
              Your email has been verified. You can now sign in.
            </div>
          ) : null}
          {authErrorMessage ? <div className="auth-alert">{authErrorMessage}</div> : null}
          {searchParams.get("signup") === "account-exists" ? (
            <div className="signup-signin-notice" role="status">
              <strong>Couldn't complete sign-up?</strong>
              <p>If you already have an account, try signing in with this email.</p>
              <p>
                Don't remember your password? Try the{" "}
                <Link href={`/auth/forgot-password?email=${encodeURIComponent(email)}`}>
                  Forgot Password
                </Link>{" "}
                option.
              </p>
            </div>
          ) : null}
          {signinErrorCode === "email-not-verified" ? (
            <div className="auth-alert auth-alert-verification" role="alert">
              <p>Please verify your email before signing in. Check your inbox or spam folder.</p>
              <button
                className="btn-primary"
                type="button"
                onClick={handleResendVerification}
                disabled={!email.trim() || resendingVerification || verificationResendCooldown > 0}
              >
                {resendingVerification ? "Sending..." : verificationResendCooldown > 0 ? `Try again in ${verificationResendCooldown}s` : "Resend verification email"}
              </button>
            </div>
          ) : null}
          <div className="auth-fields">
            <label className="field">
              <span>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <div className="field">
              <label htmlFor="signin-password">Password</label>
              <div className="password-input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  id="signin-password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  className="password-visibility-toggle"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 9 4.5 10 7-.4 1-1.3 2.2-2.6 3.3M6.2 6.2C3.8 7.6 2.4 10 2 12c1 2.5 4.8 7 10 7 1.1 0 2.1-.2 3-.5" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
            </div>
          </div>
          <button
            className="btn-primary"
            type="button"
            onClick={handleSignin}
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <div className="auth-sub">
            <Link href="/auth/forgot-password">Forgot password?</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
