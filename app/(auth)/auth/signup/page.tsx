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
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={form.password}
                onChange={(event) =>
                  setForm((state) => ({ ...state, password: event.target.value }))
                }
              />
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
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={form.confirmPassword}
                onChange={(event) =>
                  setForm((state) => ({ ...state, confirmPassword: event.target.value }))
                }
              />
            </label>
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
