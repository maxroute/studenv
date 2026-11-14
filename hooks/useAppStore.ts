"use client";

import { create } from "zustand";
import type { ItemFilters } from "@/types";

type AppState = {
  filters: ItemFilters;
  selectedId: string | null;
  confirmDeleteOpen: boolean;
  setFilter: <K extends keyof ItemFilters>(key: K, value: ItemFilters[K]) => void;
  setNav: (value: ItemFilters["nav"]) => void;
  toggleTag: (value: string) => void;
  resetFilters: () => void;
  setSelectedId: (value: string | null) => void;
  setConfirmDeleteOpen: (value: boolean) => void;
};

const defaultFilters: ItemFilters = {
  nav: "all",
  sort: "newest",
  view: "grid",
};

export const useAppStore = create<AppState>((set) => ({
  filters: defaultFilters,
  selectedId: null,
  confirmDeleteOpen: false,
  setFilter: (key, value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value,
      },
    })),
  setNav: (value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        nav: value ?? "all",
        q: undefined,
        status: undefined,
        tag: undefined,
      },
    })),
  toggleTag: (value) =>
    set((state) => ({
      filters: {
        ...state.filters,
        tag: state.filters.tag === value ? undefined : value,
      },
    })),
  resetFilters: () => set({ filters: defaultFilters }),
  setSelectedId: (value) => set({ selectedId: value }),
  setConfirmDeleteOpen: (value) => set({ confirmDeleteOpen: value }),
}));
