"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Home, Menu, Plus, Search } from "lucide-react";
import { BrandLockup } from "@/components/ui/brand-logo";
import { useAppStore } from "@/hooks/useAppStore";
import { useUser } from "@/hooks/useUser";

type TopbarProps = {
  user: {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    image?: string | null;
  };
  onOpenSidebar?: () => void;
};

export function Topbar({ user: initialUser, onOpenSidebar }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { filters, setFilter, setAddOpen } = useAppStore();
  const { user: freshUser } = useUser();
  const user = (freshUser || initialUser) as typeof initialUser;

  const initials = useMemo(() => {
    const parts = (user.name ?? "Studenv").trim().split(/\s+/);
    return `${parts[0]?.[0] ?? "S"}${parts[1]?.[0] ?? "B"}`.toUpperCase();
  }, [user.name]);

  const avatarSrc = user.avatarUrl || user.image || null;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function handleSignOut() {
    setMenuOpen(false);
    void signOut({ callbackUrl: "/auth/login" });
  }

  const isLibraryRoute =
    pathname === "/dashboard" ||
    pathname === "/shelf" ||
    pathname.startsWith("/shelf/");

  function ensureLibraryContext() {
    if (!isLibraryRoute) {
      router.push("/dashboard");
    }
  }

  return (
    <header className="topbar">
      <button
        aria-label="Open navigation"
        className="topbar-icon-btn topbar-menu-btn"
        title="Navigation"
        type="button"
        onClick={onOpenSidebar}
      >
        <Menu size={18} />
      </button>

      <Link
        className="logo"
        href="/dashboard"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          color: "var(--amber)",
          textDecoration: "none",
        }}
      >
        <BrandLockup
          height={24}
          imageClassName="logo-mark"
          textClassName="logo-wordmark"
          variant="badge"
          width={24}
        />
      </Link>

      <div className={`search-wrap${searchOpen ? " open" : ""}`}>
        <div className="search-bar">
          <Search className="search-icon" size={15} />
          <input
            ref={inputRef}
            aria-label="Search items"
            placeholder="Search titles, tags, notes..."
            value={filters.q ?? ""}
            onChange={(event) => {
              ensureLibraryContext();
              setFilter("q", event.target.value || undefined);
            }}
          />
          <span className="kbd">Ctrl K</span>
        </div>
      </div>

      <div className="topbar-actions">
        <button
          aria-label="Search"
          className="topbar-icon-btn topbar-search-btn"
          title="Search"
          type="button"
          onClick={() => {
            setSearchOpen((current) => {
              const next = !current;
              if (!current) {
                window.setTimeout(() => inputRef.current?.focus(), 0);
              }
              return next;
            });
          }}
        >
          <Search size={17} />
        </button>

        {pathname.startsWith("/shelf") || pathname.startsWith("/workspaces") ? (
          <button
            aria-label="Home"
            className="btn-home"
            title="Home"
            type="button"
            onClick={() => router.push("/dashboard")}
          >
            <Home className="topbar-action-icon" size={16} />
            <span className="topbar-action-label">Home</span>
          </button>
        ) : null}

        <button
          aria-label="Add item"
          className="btn-add"
          title="Add item"
          type="button"
          onClick={() => {
            ensureLibraryContext();
            setAddOpen(true);
          }}
        >
          <Plus className="topbar-action-icon" size={16} />
          <span className="topbar-action-label">Add Item</span>
        </button>

        <div className={`topbar-account${menuOpen ? " open" : ""}`} ref={accountRef}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Account menu"
            className="avatar avatar-trigger"
            onClick={() => setMenuOpen((current) => !current)}
            type="button"
          >
            {avatarSrc ? (
              <img
                alt={user.name ?? "Profile avatar"}
                className="avatar-image"
                src={avatarSrc}
              />
            ) : (
              initials
            )}
          </button>
          <div className={`account-menu${menuOpen ? " open" : ""}`} role="menu">
            <div className="account-menu-head">
              <div className="account-menu-name">{user.name ?? "Studenv"}</div>
              <div className="account-menu-email">{user.email ?? "Signed in"}</div>
            </div>
            <hr className="menu-divider" />
            <Link
              className="account-menu-item"
              href={pathname.startsWith("/shelf") ? "/shelf/profile" : "/profile"}
              onClick={() => setMenuOpen(false)}
              role="menuitem"
            >
              Profile
            </Link>
            <Link
              className="account-menu-item"
              href="/settings"
              onClick={() => setMenuOpen(false)}
              role="menuitem"
            >
              Settings
            </Link>
            <hr className="menu-divider account-menu-separator" />
            <button
              className="account-menu-item danger"
              onClick={handleSignOut}
              role="menuitem"
              type="button"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
