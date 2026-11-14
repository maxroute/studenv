"use client";

import { create } from "zustand";

/** Which note the workspace side panel shows (null: closed). */
export const useNotePanelStore = create<{ noteId: string | null; open: (noteId: string) => void; close: () => void }>((set) => ({
  noteId: null,
  open: (noteId) => set({ noteId }),
  close: () => set({ noteId: null }),
}));
