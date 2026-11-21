"use client";

import "@/components/notes/note-dialogs.css";
import { askConfirm } from "@/components/notes/note-dialogs";

/** Asks before signing out, so a stray tap doesn't end the session. */
export function confirmSignOut(): Promise<boolean> {
  return askConfirm({
    title: "Sign out of Studenv?",
    message: "You'll need your email and password to sign in again.",
    confirmText: "Sign out",
    danger: true,
  });
}
