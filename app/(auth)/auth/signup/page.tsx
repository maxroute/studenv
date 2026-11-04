"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { apiFetcher } from "@/lib/client/fetcher";
import { signupSchema } from "@/lib/models/user.model";
import { BrandLockup } from "@/components/ui/brand-logo";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const strength = useMemo(() => {
    let score = 0;
    if (form.password.length >= 8) score += 1;
    if (/[A-Z]/.test(form.password)) score += 1;
    if (/[0-9]/.test(form.password)) score += 1;
    if (/[^A-Za-z0-9]/.test(form.password)) score += 1;
    return score;
  }, [form.password]);

  async function handleSignup() {
    if (loading) return;

    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check your details.");
      return;
    }

    try {
      setLoading(true);
      const signupData = parsed.data;
      const result = await apiFetcher<{ outcome: "created" | "verification_required" | "existing_verified" }>(
        "/api/auth/signup",
        {
          method: "POST",
          body: JSON.stringify(signupData),
        },
      );

      if (result.outcome === "existing_verified") {
        router.push(
          `/auth/login?email=${encodeURIComponent(signupData.email)}&signup=account-exists`,
        );
        return;
      }

      router.push(`/auth/verify-email?email=${encodeURIComponent(signupData.email)}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap auth-wrap-signup">
      <div className="auth-left auth-left-signup">
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
        <div className="signup-left-body">
          <div className="signup-showcase">
            <div className="signup-showcase-hero">
              <div className="signup-showcase-kicker">from capture to clarity</div>
              <div className="signup-showcase-title">
                Capture fast. Find it when it matters.
              </div>
              <div className="signup-showcase-sub">
                Save links, PDFs, videos, and notes in one place.
              </div>
              <div className="signup-showcase-flow">
                <div className="signup-flow-step">
                  <span className="signup-flow-dot signup-flow-dot-amber" />
                  <div>
                    <strong>Capture fast</strong>
                    <span>Save in seconds.</span>
                  </div>
                </div>
                <div className="signup-flow-step">
                  <span className="signup-flow-dot signup-flow-dot-teal" />
                  <div>
                    <strong>Organize lightly</strong>
                    <span>Tag and sort cleanly.</span>
                  </div>
                </div>
                <div className="signup-flow-step">
                  <span className="signup-flow-dot signup-flow-dot-red" />
                  <div>
                    <strong>Find it again</strong>
                    <span>Surface it instantly.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="signup-showcase-grid">
              <div className="signup-mini-card">
                <div className="signup-mini-label">capture</div>
                <div className="signup-mini-value">Links, notes, PDFs, videos</div>
              </div>
              <div className="signup-mini-card">
                <div className="signup-mini-label">organize</div>
                <div className="signup-mini-value">Tags, collections, progress</div>
              </div>
              <div className="signup-mini-card">
                <div className="signup-mini-label">recall</div>
                <div className="signup-mini-value">Searchable and ready to reuse</div>
              </div>
            </div>
          </div>

          <div className="auth-tagline auth-tagline-signup">
            <div className="auth-tagline-title">
              Build a system that feels <em>inevitable.</em>
            </div>
            <div className="auth-tagline-sub">
              Your knowledge, ready when you need it.
            </div>
          </div>
        </div>
      </div>
      <div className="auth-right auth-right-signup">
        <div className="auth-form auth-form-signup">
          <div className="auth-title">
            Create your <em>account</em>
          </div>
          <div className="auth-sub">
            Already have one? <Link href="/auth/login">Sign in</Link>
          </div>
          <div className="auth-fields">
            <div className="field-row">
              <label className="field">
                <span>First name</span>
                <input
                  autoComplete="given-name"
                  required
                  value={form.firstName}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, firstName: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Last name</span>
                <input
                  autoComplete="family-name"
                  required
                  value={form.lastName}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, lastName: event.target.value }))
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(event) =>
                  setForm((state) => ({ ...state, email: event.target.value }))
                }
              />
            </label>
            <div className="field">
              <label htmlFor="signup-password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={form.password}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, password: event.target.value }))
                  }
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
              <div className="pwd-strength">
                <div
                  className="pwd-strength-fill"
                  style={{
                    width: `${strength * 25}%`,
                    background:
                      strength < 2 ? "#e05a4b" : strength < 4 ? "#f5a623" : "#5abf7a",
                  }}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="signup-confirm-password">Confirm password</label>
              <div className="password-input-wrap">
                <input
                  id="signup-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={form.confirmPassword}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, confirmPassword: event.target.value }))
                  }
                />
                <button
                  className="password-visibility-toggle"
                  type="button"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  aria-pressed={showConfirmPassword}
                >
                  {showConfirmPassword ? (
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
            onClick={handleSignup}
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
          <div className="auth-divider">or</div>
          <div className="social-btns">
            <button className="social-btn" type="button" onClick={() => signIn("google")}>
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
