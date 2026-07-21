"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/ui/brand-logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  async function doLogin(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (res?.error) {
      setError("Invalid email or password");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  async function doGoogleLogin() {
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <div className="auth-wrap">
      <div className="auth-left">
        <div className="auth-brand" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
          <div className="art-card art-a" style={{ animation: "fadeUp 0.4s 0.05s both" }}>
            <div className="art-card-type">Article</div>
            <div className="art-card-title">
              The Bitter Lesson — Sutton's Case for Scale over Structure
            </div>
            <div className="art-card-footer">
              <span className="art-tag">machine-learning</span>
              <span className="art-tag">ai-history</span>
              <span className="art-status reading">Reading</span>
            </div>
          </div>
          <div className="art-card art-p" style={{ animation: "fadeUp 0.4s 0.15s both" }}>
            <div className="art-card-type">PDF</div>
            <div className="art-card-title">
              Attention Is All You Need — Original Transformer Paper
            </div>
            <div className="art-card-footer">
              <span className="art-tag">nlp</span>
              <span className="art-status done">Done</span>
            </div>
          </div>
          <div className="art-card art-n" style={{ animation: "fadeUp 0.4s 0.25s both" }}>
            <div className="art-card-type">Note</div>
            <div className="art-card-title">
              DDIA Chapter 5 — Replication Notes & Key Takeaways
            </div>
            <div className="art-card-footer">
              <span className="art-tag">systems-design</span>
              <span className="art-status unread">Unread</span>
            </div>
          </div>
        </div>
        <div className="auth-tagline">
          <div className="auth-tagline-title">
            Your knowledge,<br /><em>beautifully organized.</em>
          </div>
          <div className="auth-tagline-sub">
            Save anything. Tag everything. Never lose a thought again.
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form" style={{ animation: "fadeUp 0.35s both" }}>
          <div>
            <div className="auth-title">Welcome <em>back.</em></div>
            <div className="auth-sub" style={{ marginTop: "8px" }}>
              Don't have an account?{" "}
              <Link href="/signup" style={{ color: "var(--amber)", textDecoration: "none" }}>
                Sign up free
              </Link>
            </div>
          </div>

          {error && <div className="auth-alert">{error}</div>}

          <form className="auth-fields" onSubmit={doLogin}>
            <div className="field">
              <label>Email address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Password</label>
              <div className="pwd-wrap">
                <input
                  type={showPwd ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="pwd-toggle"
                  onClick={() => setShowPwd(!showPwd)}
                >
                  👁
                </button>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "-8px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12.5px", color: "var(--muted)" }}>
                <input type="checkbox" defaultChecked style={{ accentColor: "var(--amber)" }} />
                Remember me
              </label>
              <Link href="/forgot-password" style={{ fontSize: "12.5px", color: "var(--amber)", cursor: "pointer", textDecoration: "none" }}>
                Forgot password?
              </Link>
            </div>
            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: "16px", width: "100%" }}>
              {loading ? "Signing in..." : "Sign in to your vault"}
            </button>
          </form>

          <div className="auth-divider">or continue with</div>
          <div className="social-btns">
            <button type="button" className="social-btn" onClick={doGoogleLogin}>
              <span className="social-icon">G</span> Google
            </button>
            <button type="button" className="social-btn">
              <span className="social-icon">𝕏</span> Twitter/X
            </button>
          </div>
          <div className="terms">
            By signing in, you agree to our <a href="#">Terms of Service</a> and{" "}
            <a href="#">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  );
}
