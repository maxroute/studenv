"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { BrandLockup } from "@/components/ui/brand-logo";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  async function doSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Notice we are assuming `confirmPassword` is the same to pass the Zod validation
        body: JSON.stringify({ email, password, firstName, lastName, confirmPassword: password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to sign up");
      }

      // Automatically log them in after signup
      const loginRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (loginRes?.error) {
        router.push("/auth/signin?registered=true");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
              How I Read & Retain 50 Books a Year Without Forgetting
            </div>
            <div className="art-card-footer">
              <span className="art-tag">productivity</span>
              <span className="art-tag">learning</span>
              <span className="art-status unread">Unread</span>
            </div>
          </div>
          <div className="art-card art-n" style={{ animation: "fadeUp 0.4s 0.15s both" }}>
            <div className="art-card-type">Note</div>
            <div className="art-card-title">
              Ideas: AI Flashcard Generator from Saved Articles
            </div>
            <div className="art-card-footer">
              <span className="art-tag">ideas</span>
              <span className="art-status reading">Reading</span>
            </div>
          </div>
        </div>
        <div className="auth-tagline">
          <div className="auth-tagline-title">
            Build your<br /><em>knowledge vault.</em>
          </div>
          <div className="auth-tagline-sub">
            Save PDFs, articles, videos, and notes. Tag, search, and actually learn.
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form" style={{ animation: "fadeUp 0.35s both" }}>
          <div>
            <div className="auth-title">Create your <em>vault.</em></div>
            <div className="auth-sub" style={{ marginTop: "8px" }}>
              Already have an account?{" "}
              <Link href="/auth/signin" style={{ color: "var(--amber)", textDecoration: "none" }}>
                Sign in
              </Link>
            </div>
          </div>

          {error && <div className="auth-alert">{error}</div>}

          <form className="auth-fields" onSubmit={doSignup}>
            <div className="field-row">
              <div className="field">
                <label>First name</label>
                <input type="text" placeholder="Jane" value={firstName} onChange={e => setFirstName(e.target.value)} required />
              </div>
              <div className="field">
                <label>Last name</label>
                <input type="text" placeholder="Doe" value={lastName} onChange={e => setLastName(e.target.value)} required />
              </div>
            </div>
            <div className="field">
              <label>Email address</label>
              <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Password</label>
              <div className="pwd-wrap">
                <input
                  type={showPwd ? "text" : "password"}
                  placeholder="Create a password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button type="button" className="pwd-toggle" onClick={() => setShowPwd(!showPwd)}>👁</button>
              </div>
              <div className="pwd-strength">
                <div className="pwd-strength-fill" style={{ width: password.length > 5 ? '100%' : '0%', background: password.length > 5 ? 'var(--green)' : 'transparent', height: '100%', borderRadius: '2px', transition: 'width 0.3s, background 0.3s' }}></div>
              </div>
              <div className="field-hint">Use 8+ characters</div>
            </div>
            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: "16px", width: "100%" }}>
              {loading ? "Creating account..." : "Create your free account"}
            </button>
          </form>

          <div className="auth-divider">or sign up with</div>
          <div className="social-btns">
            <button type="button" className="social-btn" onClick={doGoogleLogin}>
              <span className="social-icon">G</span> Google
            </button>
            <button type="button" className="social-btn">
              <span className="social-icon">𝕏</span> Twitter/X
            </button>
          </div>
          <div className="terms">
            By signing up, you agree to our <a href="#">Terms of Service</a> and{" "}
            <a href="#">Privacy Policy</a>.<br />Free forever. No credit card required.
          </div>
        </div>
      </div>
    </div>
  );
}
