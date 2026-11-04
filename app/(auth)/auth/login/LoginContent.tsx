"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getAuthErrorMessage } from "@/lib/auth/error-message";
import { toLocalAppPath } from "@/lib/auth/local-redirect";
import { BrandLockup } from "@/components/ui/brand-logo";

export function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loginErrorCode, setLoginErrorCode] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const callbackUrl = toLocalAppPath(searchParams.get("callbackUrl"), "/dashboard");
  const authError = searchParams.get("error");
  const authErrorMessage = useMemo(
    () => getAuthErrorMessage(authError),
    [authError],
  );

  useEffect(() => {
    if (authErrorMessage) {
      toast.error(authErrorMessage);
    }
  }, [authErrorMessage]);

  useEffect(() => {
    const isDesktop =
      typeof window !== "undefined" &&
      (window.navigator.userAgent.includes("Electron") ||
        document.documentElement.dataset.desktopApp === "true");

    if (!isDesktop && searchParams.get("desktopSignIn") === "true") {
      setGoogleLoading(true);
      void signIn("google", { callbackUrl: "/auth/desktop-callback" });
    }
  }, [searchParams]);

  async function handleLogin() {
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
    if (!email.trim() || resendingVerification) return;

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

      toast.success(
        "If your account still needs verification, a new link will be sent. Check your inbox.",
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setResendingVerification(false);
    }
  }

  function handleGoogleSignIn() {
    setGoogleLoading(true);
    const isDesktop =
      typeof window !== "undefined" &&
      (window.navigator.userAgent.includes("Electron") ||
        document.documentElement.dataset.desktopApp === "true");

    const isMobileApp =
      typeof window !== "undefined" &&
      (window as any).Capacitor;

    if (isMobileApp) {
      const websiteUrl = window.location.origin;
      const loginUrl = `${websiteUrl}/auth/login?desktopSignIn=true`;
      const Browser = (window as any).Capacitor?.Plugins?.Browser;
      if (Browser) {
        Browser.open({ url: loginUrl });
      } else {
        window.open(loginUrl, "_blank");
      }
    } else if (isDesktop) {
      const websiteUrl = window.location.origin;
      const loginUrl = `${websiteUrl}/auth/login?desktopSignIn=true`;
      window.open(loginUrl, "_blank");
    } else {
      void signIn("google", { callbackUrl: toLocalAppPath(callbackUrl, "/dashboard") });
    }
  }

  function cancelGoogleSignIn() {
    setGoogleLoading(false);
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
          {authErrorMessage ? <div className="auth-alert">{authErrorMessage}</div> : null}
          {loginErrorCode === "email-not-verified" ? (
            <div className="auth-alert" role="alert">
              <p>Please verify your email before signing in. Check your inbox, including your Spam or Junk folder.</p>
              <button
                className="btn-primary"
                type="button"
                onClick={handleResendVerification}
                disabled={!email.trim() || resendingVerification}
              >
                {resendingVerification ? "Sending..." : "Resend verification email"}
              </button>
            </div>
          ) : null}
          <div className="auth-fields">
            <label className="field">
              <span>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </div>
          <button className="btn-primary" type="button" onClick={handleLogin}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <div className="auth-divider">or</div>
          <div className="social-btns">
            {googleLoading ? (
              <div className="social-btn-group">
                <button
                  className="social-btn social-btn-loading"
                  type="button"
                  disabled
                >
                  <span className="social-spinner" /> Connecting to Google...
                </button>
                <button
                  className="social-btn-cancel"
                  type="button"
                  onClick={cancelGoogleSignIn}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="social-btn"
                type="button"
                onClick={handleGoogleSignIn}
              >
                Continue with Google
              </button>
            )}
          </div>
          <div className="auth-sub" style={{ marginTop: "1rem", fontSize: "11px", opacity: 0.6 }}>
            Brave user? If login fails, try disabling Shields or allowing cookies.
          </div>
          <div className="auth-sub">
            <Link href="/auth/forgot-password">Forgot password?</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
