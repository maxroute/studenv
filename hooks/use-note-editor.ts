"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteDocEnvelope } from "@/lib/notes/note-format";

export type NoteSaveStatus = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error" | "readonly";

export type LoadedNote = {
  id: string;
  title: string;
  version: number;
  parentId: string | null;
  itemId: string | null;
  doc: unknown;
  updatedAt: string;
  deletedAt: string | null;
};

export type NoteConflict = { currentVersion: number; updatedAt: string };

type Pending = { title: string; doc: NoteDocEnvelope };

const AUTOSAVE_DELAY_MS = 1000;

async function request<T>(url: string, init?: RequestInit): Promise<{ status: number; data?: T; error?: string; details?: unknown }> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await response.json().catch(() => null);
  return { status: response.status, data: json?.data, error: json?.error, details: json?.details };
}

/**
 * Loads a note and autosaves it about a second after typing stops. Saves run
 * one at a time; content changed during a save is sent right after it. A save
 * refused because the note changed elsewhere (409) stops autosave and keeps the
 * local content until the user chooses what to do.
 */
export function useNoteEditor(noteId: string) {
  const [note, setNote] = useState<LoadedNote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<NoteSaveStatus>("idle");
  const [conflict, setConflict] = useState<NoteConflict | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const versionRef = useRef(0);
  const pendingRef = useRef<Pending | null>(null);
  const savingRef = useRef(false);
  const blockedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const noteIdRef = useRef(noteId);
  /** Title and content as last loaded or saved; identical changes are not sent. */
  const baselineRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const result = await request<LoadedNote>(`/api/notes/${noteId}`);
    if (noteIdRef.current !== noteId) return null;
    if (result.status !== 200 || !result.data) {
      setLoadError(result.status === 404 ? "This note does not exist or was deleted." : result.error ?? "The note could not be loaded.");
      return null;
    }
    versionRef.current = result.data.version;
    blockedRef.current = false;
    pendingRef.current = null;
    setNote(result.data);
    setConflict(null);
    setStatus("idle");
    return result.data;
  }, [noteId]);

  useEffect(() => {
    noteIdRef.current = noteId;
    setNote(null);
    void load();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [load, noteId]);

  const flush = useCallback(async () => {
    if (savingRef.current || blockedRef.current) return;
    savingRef.current = true;
    try {
      while (pendingRef.current && !blockedRef.current) {
        const sending = pendingRef.current;
        pendingRef.current = null;
        setStatus("saving");
        const result = await request<LoadedNote>(`/api/notes/${noteId}`, {
          method: "PUT",
          body: JSON.stringify({ title: sending.title, doc: sending.doc, baseVersion: versionRef.current }),
        });
        if (result.status === 409) {
          blockedRef.current = true;
          pendingRef.current = pendingRef.current ?? sending;
          const details = result.details as NoteConflict | undefined;
          setConflict(details ?? { currentVersion: versionRef.current, updatedAt: new Date().toISOString() });
          setStatus("conflict");
          return;
        }
        if (result.status !== 200 || !result.data) {
          // Keep the content for the next attempt; never report it as saved.
          pendingRef.current = pendingRef.current ?? sending;
          setStatus("error");
          return;
        }
        const saved = result.data;
        baselineRef.current = JSON.stringify(sending);
        versionRef.current = saved.version;
        setNote((current) => (current ? { ...current, title: saved.title, version: saved.version, updatedAt: saved.updatedAt } : current));
        setLastSavedAt(Date.now());
        setStatus(pendingRef.current ? "dirty" : "saved");
      }
    } finally {
      savingRef.current = false;
    }
  }, [noteId]);

  /** Records the latest content and saves it after a short pause. */
  const change = useCallback(
    (title: string, doc: NoteDocEnvelope) => {
      if (!blockedRef.current && !pendingRef.current && !savingRef.current && JSON.stringify({ title, doc }) === baselineRef.current) return;
      pendingRef.current = { title, doc };
      if (blockedRef.current) return;
      setStatus("dirty");
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  const saveNow = useCallback(async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    await flush();
  }, [flush]);

  /** Conflict choice: discard local changes and load the latest version. */
  const loadLatest = useCallback(async () => {
    pendingRef.current = null;
    return load();
  }, [load]);

  /** Conflict choice: keep the server copy as a revision, then save mine over it. */
  const keepMine = useCallback(async () => {
    const mine = pendingRef.current;
    if (!mine) return;
    setStatus("saving");
    const result = await request<LoadedNote>(`/api/notes/${noteId}`, {
      method: "PUT",
      body: JSON.stringify({ title: mine.title, doc: mine.doc, baseVersion: versionRef.current, overwrite: true }),
    });
    if (result.status !== 200 || !result.data) {
      setStatus("conflict");
      return;
    }
    const saved = result.data;
    pendingRef.current = null;
    blockedRef.current = false;
    versionRef.current = saved.version;
    setConflict(null);
    setNote((current) => (current ? { ...current, version: saved.version, updatedAt: saved.updatedAt } : current));
    setLastSavedAt(Date.now());
    setStatus("saved");
  }, [noteId]);

  /** Conflict choice: save my content as a separate new note. Returns its id. */
  const saveAsNew = useCallback(async () => {
    const mine = pendingRef.current;
    if (!mine) return null;
    const result = await request<LoadedNote>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: `${mine.title} (my copy)`, doc: mine.doc }),
    });
    return result.status === 201 && result.data ? result.data.id : null;
  }, []);

  /** Marks what the editor shows right after loading as already saved. */
  const setBaseline = useCallback((title: string, doc: NoteDocEnvelope) => {
    baselineRef.current = JSON.stringify({ title, doc });
  }, []);

  const markReadOnly = useCallback(() => {
    blockedRef.current = true;
    setStatus("readonly");
  }, []);

  return { note, loadError, status, conflict, lastSavedAt, change, saveNow, loadLatest, keepMine, saveAsNew, markReadOnly, setBaseline, reload: load };
}
