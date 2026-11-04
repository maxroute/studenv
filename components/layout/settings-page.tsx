"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { 
  User, Mail, KeyRound, Palette, Bell, Shield, 
  Keyboard, Database, CreditCard, Loader2, 
  BrainCircuit, Timer, AlertTriangle, ChevronDown, ChevronRight
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { apiFetcher } from "@/lib/client/fetcher";

// --- Types ---

type UserSettings = {
  account: {
    name: string;
    username: string;
    email: string;
    bio: string;
    hasPassword?: boolean;
    emailVerified: boolean;
    emailVerifySentAt?: string | null;
  };
  appearance: {
    theme: string;
    accentColor: string;
    defaultView: "grid" | "list";
  };
  notifications: {
    emailDigest: boolean;
    readingReminders: boolean;
  };
  privacy: {
    publicProfile: boolean;
    twoFactor: boolean;
  };
  billing: {
    plan: string;
    usage: number;
  };
};

// --- Sections ---

const SECTIONS = [
  { id: "account", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy", label: "Privacy", icon: Shield },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "data", label: "Data & Import", icon: Database },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "shelf", label: "Shelf", icon: BrainCircuit },
  { id: "focus", label: "Focus Mode", icon: Timer },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

type SettingsSelectOption = {
  label: string;
  value: string;
};

type SettingsSelectProps = {
  defaultValue: string;
  label: string;
  options: SettingsSelectOption[];
};

function SettingsSelect({ defaultValue, label, options }: SettingsSelectProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="field settings-select-field" ref={rootRef}>
      <span>{label}</span>
      <div className={`settings-select${open ? " open" : ""}`}>
        <button
          aria-expanded={open}
          aria-haspopup="listbox"
          className="settings-select-trigger"
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          <span>{selected.label}</span>
          <ChevronDown className={`settings-select-caret${open ? " open" : ""}`} size={16} />
        </button>

        {open ? (
          <div className="settings-select-menu" role="listbox">
            {options.map((option) => (
              <button
                className={`settings-select-option${option.value === value ? " selected" : ""}`}
                key={option.value}
                role="option"
                type="button"
                aria-selected={option.value === value}
                onClick={() => {
                  setValue(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// --- Sub-components for Sections ---

function AccountSection({ settings, onUpdate, onRefresh }: { settings: UserSettings["account"], onUpdate: (data: any) => Promise<void>, onRefresh: () => void }) {
  const [formData, setFormData] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(() => {
    if (!settings.emailVerifySentAt || settings.emailVerified) return 0;
    return Math.max(0, 60 - Math.floor((Date.now() - new Date(settings.emailVerifySentAt).getTime()) / 1000));
  });

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = window.setInterval(() => setResendCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCountdown > 0]);

  useEffect(() => {
    setFormData(settings);
    if (settings.emailVerified || !settings.emailVerifySentAt) {
      setResendCountdown(0);
    } else {
      setResendCountdown(Math.max(0, 60 - Math.floor((Date.now() - new Date(settings.emailVerifySentAt).getTime()) / 1000)));
    }
  }, [settings]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiFetcher("/api/user/profile", {
        method: "PUT",
        body: JSON.stringify(formData),
      });
      toast.success("Profile updated!");
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendingVerification || resendCountdown > 0) return;
    setResendingVerification(true);
    try {
      await apiFetcher("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: settings.email }) });
      toast.success("If your account needs verification, a new link has been sent. Check your inbox and Spam/Junk folder.");
      setResendCountdown(60);
      onRefresh();
    } catch (error: any) {
      const retryAfter = error?.details?.retryAfter;
      if (typeof retryAfter === "number") setResendCountdown(retryAfter);
      toast.error(error.message || "Could not resend the verification email.");
    } finally {
      setResendingVerification(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsSavingPassword(true);
    try {
      await apiFetcher("/api/user/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });
      toast.success("Password updated!");
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmation = window.prompt('Type "DELETE" to confirm account deletion.');
    if (confirmation !== "DELETE") return;

    setIsDeleting(true);
    try {
      await apiFetcher("/api/user/settings", { method: "DELETE" });
      toast.success("Account deleted.");
      setTimeout(() => signOut({ callbackUrl: "/" }), 1000);
    } catch (error) {
      toast.error("Failed to delete account");
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="panel">
        <div className="panel-head">
          <h2>Profile & Contact</h2>
          <p>Update your personal information and how others see you.</p>
        </div>
        <form onSubmit={handleProfileSubmit} className="settings-form-grid">
          <label className="field">
            <span>Display Name</span>
            <input 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="Your Name"
            />
          </label>
          <label className="field">
            <span>Username</span>
            <input 
              value={formData.username} 
              onChange={e => setFormData({...formData, username: e.target.value})}
              placeholder="username"
            />
          </label>
          <label className="field-full field">
            <span>Email Address</span>
            <input 
              value={formData.email} 
              onChange={e => setFormData({...formData, email: e.target.value})}
              placeholder="you@example.com"
            />
            <p className="field-hint">Changing your email will require re-verification.</p>
            <p className="field-hint" role="status">Email status: <strong>{settings.emailVerified ? "Verified" : "Not verified"}</strong></p>
            {!settings.emailVerified ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="ghost" onClick={handleResendVerification} disabled={resendingVerification || resendCountdown > 0}>
                  {resendingVerification ? "Sending..." : resendCountdown > 0 ? `Resend available in ${resendCountdown}s` : "Resend verification email"}
                </Button>
                <span className="field-hint">Check your inbox and Spam/Junk folder. Links expire after 1 hour.</span>
              </div>
            ) : null}
          </label>
          <label className="field-full field">
            <span>Bio</span>
            <textarea 
              value={formData.bio} 
              onChange={e => setFormData({...formData, bio: e.target.value})}
              placeholder="A little bit about yourself..."
            />
          </label>
          <div className="panel-actions field-full">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Profile"}
            </Button>
          </div>
        </form>
      </section>

      {settings.hasPassword && (
        <section className="panel">
          <div className="panel-head">
            <h2>Security</h2>
            <p>Change your password to keep your account secure.</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="settings-form-grid">
            <label className="field">
              <span>Current Password</span>
              <input 
                type="password"
                value={passwordData.currentPassword} 
                onChange={e => setPasswordData({...passwordData, currentPassword: e.target.value})}
              />
            </label>
            <div className="field-row field-full">
              <label className="field">
                <span>New Password</span>
                <input 
                  type="password"
                  value={passwordData.newPassword} 
                  onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})}
                />
              </label>
              <label className="field">
                <span>Confirm New Password</span>
                <input 
                  type="password"
                  value={passwordData.confirmPassword} 
                  onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                />
              </label>
            </div>
            <div className="panel-actions field-full">
              <Button type="submit" disabled={isSavingPassword}>
                {isSavingPassword ? "Updating..." : "Update Password"}
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="panel danger-zone">
        <div className="panel-head">
          <h2 className="text-red">Danger Zone</h2>
          <p>Permanently remove your account and all associated data.</p>
        </div>
        <div className="panel-actions">
          <Button variant="danger" onClick={handleDeleteAccount} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete Account"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function AppearanceSection() {
  const accents = ["#f5a623", "#4abfb5", "#e05a4b", "#9b7fe8", "#6ba3e0"];
  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <h2>Appearance</h2>
        <p>Fine tune the accent system and default layout.</p>
      </div>
      <div className="swatches">
        {accents.map((color) => (
          <button
            key={color}
            className="swatch"
            style={{ background: color }}
            type="button"
            onClick={() => {
              document.documentElement.style.setProperty("--amber", color);
              document.documentElement.style.setProperty("--amber-glow", `${color}18`);
              document.documentElement.style.setProperty("--amber-dim", `${color}40`);
            }}
          />
        ))}
      </div>
      <div className="settings-form-grid">
        <SettingsSelect
          defaultValue="dark"
          label="Theme"
          options={[
            { label: "Dark", value: "dark" },
            { label: "System", value: "system" },
          ]}
        />
        <SettingsSelect
          defaultValue="grid"
          label="Default view"
          options={[
            { label: "Grid", value: "grid" },
            { label: "List", value: "list" },
          ]}
        />
      </div>
    </section>
  );
}

function NotificationsSection() {
  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <h2>Notifications</h2>
        <p>Control how and when you receive updates.</p>
      </div>
      <div className="settings-toggles">
        <label className="toggle-row">
          <span className="toggle-copy">Email digest</span>
          <input defaultChecked type="checkbox" />
        </label>
        <label className="toggle-row">
          <span className="toggle-copy">Reading reminders</span>
          <input defaultChecked type="checkbox" />
        </label>
      </div>
    </section>
  );
}

function PrivacySection() {
  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <h2>Privacy & Security</h2>
      </div>
      <div className="settings-toggles">
        <label className="toggle-row">
          <span className="toggle-copy">Public profile</span>
          <input type="checkbox" />
        </label>
        <label className="toggle-row">
          <span className="toggle-copy">Two-factor authentication</span>
          <input type="checkbox" />
        </label>
      </div>
    </section>
  );
}

function ShortcutsSection() {
  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <h2>Keyboard Shortcuts</h2>
      </div>
      <div className="shortcut-grid">
        {siteConfig.shortcuts.map((shortcut) => (
          <div className="shortcut-row" key={shortcut.keys}>
            <span className="kbd">{shortcut.keys}</span>
            <span>{shortcut.action}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataSection() {
  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <h2>Data & Import</h2>
        <p>Bring in what you already have and keep export options ready.</p>
      </div>
      <div className="panel-actions settings-action-row">
        <Button variant="ghost">Import Pocket</Button>
        <Button variant="ghost">Import Instapaper</Button>
        <Button>Export JSON</Button>
      </div>
    </section>
  );
}

function BillingSection() {
  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <h2>Billing</h2>
        <p>Free plan active. Upgrade whenever you need more room.</p>
      </div>
      <div className="billing-card">
        <div className="storage-label">
          <span>Items usage</span>
          <span>42 / {siteConfig.freeTierItemLimit}</span>
        </div>
        <div className="storage-bar">
          <div className="storage-fill" style={{ width: "21%" }} />
        </div>
        <div className="panel-actions">
          <Button>Upgrade to Pro</Button>
        </div>
      </div>
    </section>
  );
}

function ShelfSection() {
  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <h2>Shelf Preferences</h2>
        <p>Customize your reading and library experience.</p>
      </div>
      <div className="settings-toggles">
        <label className="toggle-row">
          <span className="toggle-copy">Auto-archive after reading</span>
          <input type="checkbox" />
        </label>
        <label className="toggle-row">
          <span className="toggle-copy">Show reading progress in library</span>
          <input defaultChecked type="checkbox" />
        </label>
      </div>
    </section>
  );
}

function FocusSection() {
  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <h2>Focus Mode</h2>
        <p>Configure your productivity sessions.</p>
      </div>
      <div className="settings-form-grid">
        <SettingsSelect
          defaultValue="25"
          label="Default Focus Duration"
          options={[
            { label: "25 minutes", value: "25" },
            { label: "45 minutes", value: "45" },
            { label: "60 minutes", value: "60" },
          ]}
        />
        <SettingsSelect
          defaultValue="lofi"
          label="Soundscape"
          options={[
            { label: "Lofi Beats", value: "lofi" },
            { label: "Rain", value: "rain" },
            { label: "None", value: "none" },
          ]}
        />
      </div>
    </section>
  );
}

// --- Main Component ---

export function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSection = (searchParams.get("section") as SectionId) || "account";
  const sectionPickerRef = useRef<HTMLDivElement>(null);
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);

  const { data: rawSettings, error, isLoading, mutate } = useSWR<any>("/api/user/profile", apiFetcher);

  const settings: UserSettings = useMemo(() => {
    // Temporary debug logs
    console.log("[SETTINGS] Raw API data:", rawSettings);
    if (error) console.error("[SETTINGS] Fetch error:", error);

    const mapped: UserSettings = {
      account: {
        name: rawSettings?.name || "",
        username: rawSettings?.username || "",
        email: rawSettings?.email || "",
        bio: rawSettings?.bio || "",
        hasPassword: rawSettings?.hasPassword ?? false,
        emailVerified: Boolean(rawSettings?.emailVerified),
        emailVerifySentAt: rawSettings?.emailVerifySentAt ?? null,
      },
      appearance: {
        theme: "dark",
        accentColor: "#f5a623",
        defaultView: "grid",
      },
      notifications: {
        emailDigest: true,
        readingReminders: true,
      },
      privacy: {
        publicProfile: false,
        twoFactor: false,
      },
      billing: {
        plan: rawSettings?.plan || "free",
        usage: 42,
      },
    };

    console.log("[SETTINGS] Mapped settings object:", mapped);
    return mapped;
  }, [rawSettings, error]);

  const setSection = (id: SectionId) => {
    const params = new URLSearchParams(searchParams);
    params.set("section", id);
    router.push(`/settings?${params.toString()}`);
    setSectionPickerOpen(false);
  };

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!sectionPickerRef.current?.contains(event.target as Node)) {
        setSectionPickerOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSectionPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  if (isLoading && !rawSettings) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-amber" />
      </div>
    );
  }

  // Section Registry
  const renderSection = () => {
    switch (currentSection) {
      case "account": return <AccountSection settings={settings.account} onUpdate={async () => {}} onRefresh={mutate} />;
      case "appearance": return <AppearanceSection />;
      case "notifications": return <NotificationsSection />;
      case "privacy": return <PrivacySection />;
      case "shortcuts": return <ShortcutsSection />;
      case "data": return <DataSection />;
      case "billing": return <BillingSection />;
      case "shelf": return <ShelfSection />;
      case "focus": return <FocusSection />;
      default: return <AccountSection settings={settings.account} onUpdate={async () => {}} onRefresh={mutate} />;
    }
  };

  const activeSection = SECTIONS.find((section) => section.id === currentSection) ?? SECTIONS[0];
  const ActiveSectionIcon = activeSection.icon;

  return (
    <div className="settings-page">
      <div className="settings-sidebar">
        <div className="settings-sidebar-header">
          <h1>Settings</h1>
        </div>
        <nav className="settings-nav">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = currentSection === s.id;
            return (
              <button
                key={s.id}
                className={`settings-nav-item ${isActive ? "active" : ""}`}
                type="button"
                onClick={() => setSection(s.id)}
              >
                <Icon size={16} />
                <span>{s.label}</span>
                {isActive && <ChevronRight size={14} className="ml-auto" />}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="settings-content">
        <div className="settings-content-header">
           <div className="breadcrumb">
             <span>Settings</span>
             <ChevronRight size={12} />
             <span className="active">{SECTIONS.find(s => s.id === currentSection)?.label || "Account"}</span>
           </div>
        </div>
        <div className="settings-mobile-picker" ref={sectionPickerRef}>
          <button
            aria-expanded={sectionPickerOpen}
            aria-haspopup="menu"
            className="settings-mobile-trigger"
            type="button"
            onClick={() => setSectionPickerOpen((open) => !open)}
          >
            <span className="settings-mobile-trigger-label">
              <ActiveSectionIcon size={16} />
              {activeSection.label}
            </span>
            <ChevronDown className={`settings-mobile-caret${sectionPickerOpen ? " open" : ""}`} size={16} />
          </button>
          <div className={`settings-mobile-menu${sectionPickerOpen ? " open" : ""}`} role="menu">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = currentSection === section.id;
              return (
                <button
                  className={`settings-mobile-option${isActive ? " active" : ""}`}
                  key={section.id}
                  type="button"
                  onClick={() => setSection(section.id)}
                >
                  <Icon size={16} />
                  <span>{section.label}</span>
                  {isActive ? <ChevronRight size={14} /> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="settings-content-body">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
