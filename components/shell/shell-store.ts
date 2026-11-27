"use client";

import { create } from "zustand";

const COLLAPSED_KEY = "studenv-sidebar-collapsed";

type ShellState = {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  /** The desktop sidebar shrunk to its icons. Remembered on this device. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  restoreCollapsed: () => void;
};

export const useShellStore = create<ShellState>((set, get) => ({
  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  collapsed: false,
  toggleCollapsed: () => {
    const collapsed = !get().collapsed;
    set({ collapsed });
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {}
  },
  restoreCollapsed: () => {
    try {
      set({ collapsed: window.localStorage.getItem(COLLAPSED_KEY) === "1" });
    } catch {}
  },
}));
