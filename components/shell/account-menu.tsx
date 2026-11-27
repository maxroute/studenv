"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, Settings, Trophy, User } from "lucide-react";
import { confirmSignOut } from "@/components/layout/confirm-sign-out";
import { useUser } from "@/hooks/useUser";
import { usePopup } from "./use-popup";

export type ShellUser = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  image?: string | null;
};

/** Profile, achievements, settings and sign out. */
export function AccountMenu({ user: initialUser, placement }: { user?: ShellUser; placement: "up" | "down" }) {
  const { user: freshUser } = useUser();
  const user: ShellUser = freshUser || initialUser || {};
  const { open, setOpen, ref } = usePopup();
  const name = user.name?.trim() || "Account";
  const parts = name.split(/\s+/);
  const initials = `${parts[0]?.[0] ?? "S"}${parts[1]?.[0] ?? ""}`.toUpperCase();
  const avatar = user.avatarUrl || user.image || null;

  return (
    <div className={`shell-popup-wrap shell-account ${placement}`} ref={ref}>
      <button type="button" className="shell-account-trigger" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="shell-avatar">
          {avatar ? <img src={avatar} alt="" /> : initials}
        </span>
        <span className="shell-account-name">{parts[0]}</span>
      </button>
      {open ? (
        <div className="shell-popup" role="menu">
          <div className="shell-popup-head">
            <strong>{name}</strong>
            {user.email ? <span>{user.email}</span> : null}
          </div>
          <Link href="/profile" role="menuitem" onClick={() => setOpen(false)}>
            <User size={15} aria-hidden="true" /> Profile
          </Link>
          <Link href="/dashboard/achievements" role="menuitem" onClick={() => setOpen(false)}>
            <Trophy size={15} aria-hidden="true" /> Achievements
          </Link>
          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)}>
            <Settings size={15} aria-hidden="true" /> Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={async () => {
              setOpen(false);
              if (await confirmSignOut()) void signOut({ callbackUrl: "/auth/signin" });
            }}
          >
            <LogOut size={15} aria-hidden="true" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
