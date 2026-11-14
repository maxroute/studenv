export const siteConfig = {
  name: "Second Brain",
  description: "A personal knowledge vault for articles, notes, PDFs, and videos.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  freeTierItemLimit: Number(process.env.FREE_TIER_ITEM_LIMIT ?? 200),
  freeTierTagLimit: 50,
  /** Uploaded files per free account (shown, not yet enforced). Links and page text do not count. */
  freeTierStorageBytes: Number(process.env.FREE_TIER_STORAGE_BYTES ?? 5 * 1024 ** 3),
  plans: {
    free: "Free",
    pro: "Pro",
    team: "Team",
  },
  shortcuts: [
    { keys: "Ctrl/Cmd + K", action: "Focus search" },
    { keys: "N", action: "Open add item modal" },
    { keys: "V", action: "Toggle grid/list view" },
    { keys: "Esc", action: "Close overlays" },
    { keys: "1", action: "Open dashboard" },
    { keys: "2", action: "Open profile" },
    { keys: "3", action: "Open settings" },
  ],
} as const;

export const appNavigation = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Profile", href: "/profile" },
  { label: "Settings", href: "/settings" },
] as const;
