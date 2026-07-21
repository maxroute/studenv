"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { BrandLockup } from "@/components/ui/brand-logo";
import { apiFetcher } from "@/lib/client/fetcher";

type OnboardingContentProps = {
  initialProfile: {
    email: string;
    name: string;
    username: string;
    bio: string;
    avatarUrl: string | null;
    isEmailVerified: boolean;
  };
};

function normalizeUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function OnboardingContent({ initialProfile }: OnboardingContentProps) {
  const router = useRouter();
  const { update } = useSession();
  const [loading, setLoading] = useState(false);
  const [usernameDirty, setUsernameDirty] = useState(initialProfile.username.trim().length > 0);
  const [form, setForm] = useState({
    name: initialProfile.name,
    username: initialProfile.username,
    bio: initialProfile.bio,
    email: initialProfile.email,
  });

  const usernamePreview = useMemo(() => normalizeUsername(form.username), [form.username]);

  const completionCount = useMemo(() => {
    return [
      form.name.trim().length > 0,
      usernamePreview.length >= 3,
      form.bio.trim().length > 0,
    ].filter(Boolean).length;
  }, [form.bio, form.name, usernamePreview]);

  const canSubmit =
    form.name.trim().length > 0 &&
    usernamePreview.length >= 3 &&
    form.email.trim().length > 0 &&
    !loading;

  function updateName(value: string) {
    setForm((current) => {
      const next = { ...current, name: value };
      if (!usernameDirty) {
        next.username = normalizeUsername(value);
      }
      return next;
    });
  }

  function updateUsername(value: string) {
    setUsernameDirty(true);
    setForm((current) => ({
      ...current,
      username: normalizeUsername(value),
    }));
  }

  async function handleContinue() {
    if (!canSubmit) {
      toast.error("Add your name and a username to continue.");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: form.name.trim(),
        username: usernamePreview,
        bio: form.bio.trim() || null,
        email: form.email.trim().toLowerCase(),
        avatarUrl: initialProfile.avatarUrl,
      };

      await apiFetcher("/api/user/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      await update({
        user: {
          name: payload.name,
          username: payload.username,
          bio: payload.bio,
          email: payload.email,
          avatarUrl: initialProfile.avatarUrl,
        },
      });

      toast.success("Profile ready.");
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="onboard-wrap">
      <div className="onboard-brand">
        <BrandLockup
          height={32}
          imageClassName="auth-brand-mark"
          priority
          textClassName="auth-brand-logo"
          variant="badge"
          width={32}
        />
      </div>

      <div className="onboard-steps" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`step-dot ${index < completionCount ? "done" : ""}`}
          />
        ))}
      </div>

      <div className="onboard-card">
        <div className="onboard-step">
          <div>
            <div className="auth-title">
              Set up your <em>profile</em>
            </div>
            <p className="auth-sub">
              Review your details, choose a clean handle, and step into your workspace.
            </p>
          </div>

          <div className="auth-fields">
            <label className="field">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) => updateName(event.target.value)}
                placeholder="Your full name"
              />
            </label>

            <label className="field">
              <span>Username</span>
              <input
                value={form.username}
                onChange={(event) => updateUsername(event.target.value)}
                placeholder="your-name"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
              />
              <div className="field-hint">
                Lowercase letters, numbers, and hyphens only. Preview: @{usernamePreview || "your-name"}
              </div>
            </label>

            <label className="field">
              <span>Short bio</span>
              <textarea
                className="field-textarea"
                value={form.bio}
                onChange={(event) =>
                  setForm((current) => ({ ...current, bio: event.target.value }))
                }
                maxLength={280}
                placeholder="What are you here to learn, build, or organize?"
              />
              <div className="field-hint">{form.bio.trim().length}/280</div>
            </label>

            <label className="field">
              <span>Email</span>
              <input value={form.email} disabled />
              <div className="field-hint">
                {initialProfile.isEmailVerified
                  ? "Email verified."
                  : "You can verify your email from your inbox later."}
              </div>
            </label>
          </div>

          <div className="onboard-footer">
            <Link href="/dashboard">Skip for now</Link>
            <button className="btn-primary" type="button" onClick={handleContinue}>
              {loading ? "Saving..." : "Continue to dashboard"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
