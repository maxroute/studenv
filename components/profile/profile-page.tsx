"use client";

import type { ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ActivityChart } from "@/components/profile/activity-chart";
import { StatsGrid } from "@/components/profile/stats-grid";
import { Button } from "@/components/ui/button";
import { useItems } from "@/hooks/useItems";
import { useUser, type UserResponse } from "@/hooks/useUser";
import { apiFetcher } from "@/lib/client/fetcher";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return startOfDay(next);
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const offset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

function formatDayKey(date: Date) {
  const day = startOfDay(date);
  const year = day.getFullYear();
  const month = `${day.getMonth() + 1}`.padStart(2, "0");
  const dayOfMonth = `${day.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

type AvatarMethod = "upload" | "url";

interface ProfilePageProps {
  backHref?: string;
  backLabel?: string;
  initialUser?: UserResponse;
}

export function ProfilePage({ backHref = "/dashboard", backLabel = "Back to Home", initialUser }: ProfilePageProps) {
  const router = useRouter();
  const { user, mutate } = useUser(initialUser);
  const { items } = useItems({});
  const [editing, setEditing] = useState(false);
  const [avatarMethod, setAvatarMethod] = useState<AvatarMethod>("upload");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [form, setForm] = useState({
    name: user?.name ?? "",
    username: user?.username ?? "",
    bio: user?.bio ?? "",
    email: user?.email ?? "",
    avatarUrl: user?.avatarUrl ?? "",
  });

  const initials = useMemo(() => {
    const sourceName = editing ? form.name || user?.name : user?.name;
    const parts = (sourceName ?? "Second Brain").split(" ");
    return `${parts[0]?.[0] ?? "S"}${parts[1]?.[0] ?? "B"}`.toUpperCase();
  }, [editing, form.name, user?.name]);

  const activeAvatarUrl = editing ? form.avatarUrl || user?.avatarUrl : user?.avatarUrl;

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      item.tags.forEach((tag) => {
        counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1);
      });
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [items]);

  const recentItems = useMemo(
    () =>
      [...items]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5),
    [items],
  );



  useEffect(() => {
    setForm({
      name: user?.name ?? "",
      username: user?.username ?? "",
      bio: user?.bio ?? "",
      email: user?.email ?? "",
      avatarUrl: user?.avatarUrl ?? "",
    });
    setAvatarMethod("upload");
  }, [user]);

  function closeEditor() {
    setEditing(false);
    setIsUploadingAvatar(false);
    setAvatarMethod("upload");
    setForm({
      name: user?.name ?? "",
      username: user?.username ?? "",
      bio: user?.bio ?? "",
      email: user?.email ?? "",
      avatarUrl: user?.avatarUrl ?? "",
    });
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setIsUploadingAvatar(true);

      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/user/avatar", {
        method: "POST",
        body,
      });
      const json = (await response.json()) as {
        ok: boolean;
        data?: {
          avatarUrl?: string | null;
        };
        error?: string;
        details?: {
          issues?: Array<{
            message?: string;
          }>;
        };
      };

      if (!response.ok || !json.ok || !json.data?.avatarUrl) {
        const firstIssue = json.details?.issues?.find((issue) => issue.message?.trim());
        throw new Error(firstIssue?.message ?? json.error ?? "Upload failed.");
      }

      setForm((current) => ({
        ...current,
        avatarUrl: json.data?.avatarUrl ?? current.avatarUrl,
      }));
      await mutate();
      router.refresh();
      toast.success("Profile photo updated.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = "";
    }
  }

  async function saveProfile() {
    try {
      await apiFetcher("/api/user/profile", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          bio: form.bio || null,
          avatarUrl: form.avatarUrl || null,
        }),
      });
      await mutate();
      router.refresh();
      setEditing(false);
      setAvatarMethod("upload");
      toast.success("Profile updated.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="profile-page">
      <section className="profile-hero">
        <div className="profile-grid-pattern" />
        <div className="profile-avatar-lg">
          {activeAvatarUrl ? (
            <img
              alt={(editing ? form.name : user?.name) ?? "Profile avatar"}
              className="profile-avatar-image"
              src={activeAvatarUrl}
            />
          ) : (
            initials
          )}
        </div>
        <div className="profile-copy">
          <div className="profile-kicker">Profile</div>
          <h1 className="profile-name">{user?.name ?? "Your Name"}</h1>
          <div className="profile-handle">
            <span>@{user?.username ?? "username"}</span>
            <span>{user?.email}</span>
          </div>
          <p className="profile-bio">
            {user?.bio ?? "Curating a calm, well-organized second brain."}
          </p>
        </div>
        <div className="profile-actions">
          <Link className="sb-button sb-button-ghost" href={backHref}>
            {backLabel}
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              if (editing) {
                closeEditor();
                return;
              }

              setEditing(true);
            }}
          >
            {editing ? "Close" : "Edit Profile"}
          </Button>
        </div>
      </section>

      {editing ? (
        <section className="panel profile-edit-panel">
          <div className="section-head">
            <h3>Edit Profile</h3>
            <span>Update your public details</span>
          </div>
          <div className="settings-form-grid">
            {[
              ["Name", "name"],
              ["Username", "username"],
              ["Email", "email"],
            ].map(([label, key]) => (
              <label className="field" key={key}>
                <span>{label}</span>
                <input
                  value={form[key as keyof typeof form]}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <div className="field field-full profile-avatar-field">
              <span>Profile Photo</span>
              <div className="profile-avatar-methods">
                <button
                  className={`profile-avatar-method${avatarMethod === "upload" ? " active" : ""}`}
                  onClick={() => setAvatarMethod("upload")}
                  type="button"
                >
                  Photo Upload
                </button>
                <button
                  className={`profile-avatar-method${avatarMethod === "url" ? " active" : ""}`}
                  onClick={() => setAvatarMethod("url")}
                  type="button"
                >
                  Use URL
                </button>
              </div>
              {avatarMethod === "upload" ? (
                <div className="profile-avatar-upload">
                  <div className="profile-avatar-upload-row">
                    <label
                      className={`profile-avatar-upload-trigger${isUploadingAvatar ? " disabled" : ""}`}
                    >
                      <input
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={isUploadingAvatar}
                        onChange={handleAvatarUpload}
                        type="file"
                      />
                      {isUploadingAvatar
                        ? "Uploading photo..."
                        : form.avatarUrl
                          ? "Replace photo"
                          : "Choose photo"}
                    </label>
                    {form.avatarUrl ? (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            avatarUrl: "",
                          }))
                        }
                      >
                        Remove photo
                      </Button>
                    ) : null}
                  </div>
                  <p className="field-note profile-avatar-note">
                    {form.avatarUrl
                      ? "Your photo is ready. Save changes to apply it to your profile."
                      : "Upload a JPG, PNG, GIF, or WebP image up to 5 MB."}
                  </p>
                </div>
              ) : (
                <label className="field">
                  <span>Avatar URL</span>
                  <input
                    placeholder="https://example.com/avatar.jpg"
                    value={form.avatarUrl}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        avatarUrl: event.target.value,
                      }))
                    }
                  />
                </label>
              )}
            </div>
            <label className="field field-full">
              <span>Bio</span>
              <textarea
                value={form.bio}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    bio: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="panel-actions">
            <Button variant="ghost" onClick={closeEditor}>
              Cancel
            </Button>
            <Button disabled={isUploadingAvatar} onClick={saveProfile}>
              Save Changes
            </Button>
          </div>
        </section>
      ) : null}

      <StatsGrid items={items} />

      <div className="profile-columns">
        <ActivityChart items={items} className="profile-heatmap-card" />

        <section className="panel profile-tags-card">
          <div className="section-head">
            <h3>Top Tags</h3>
            <span>Most used</span>
          </div>
          <div className="tag-cloud">
            {topTags.length ? (
              topTags.map(([name, count]) => (
                <div className="tag-cloud-item" key={name}>
                  <span className="tag-cloud-dot" />
                  <span>{name}</span>
                  <span className="tag-cloud-count">{count}</span>
                </div>
              ))
            ) : (
              <div className="panel-empty">Save a few items to see your top tags.</div>
            )}
          </div>
        </section>

        <section className="panel recent-panel profile-recent-card">
          <div className="section-head">
            <h3>Recently Saved</h3>
            <span>{recentItems.length} items</span>
          </div>
          <div className="reading-list">
            {recentItems.map((item) => (
              <div className="reading-item" key={item.id}>
                <span className={`type-badge ${item.type}`}>{item.type}</span>
                <div className="reading-item-copy">
                  <div className="reading-item-title">{item.title}</div>
                  <div className="reading-item-meta">
                    {new Date(item.updatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div className={`status-pill ${item.status}`}>
                  <div className="status-dot" />
                  {item.status}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel profile-membership-card">
          <div className="section-head">
            <h3>Membership</h3>
            <span>Upgrade anytime</span>
          </div>
          <div className="upgrade-card">
            <div className="upgrade-plan">Current plan: {user?.plan ?? "free"}</div>
            <p>Move to Pro for unlimited saves, summaries, and exports.</p>
            <Button>Upgrade to Pro</Button>
          </div>
        </section>
      </div>
    </div>
  );
}
