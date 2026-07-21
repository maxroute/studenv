"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import { inferItemTypeFromUrl } from "@/lib/utils/item-type";
import { isYouTubePlaylistUrl } from "@/lib/utils/youtube";

type AddItemModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    type: "article" | "pdf" | "video" | "note";
    title: string;
    url?: string;
    excerpt?: string;
    tags?: string[];
  }) => Promise<void>;
};

const types = [
  { key: "article", label: "Article", icon: "[A]" },
  { key: "pdf", label: "PDF", icon: "[P]" },
  { key: "video", label: "Video", icon: "[V]" },
  { key: "note", label: "Note", icon: "[N]" },
] as const;

function normalizeTags(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim().replace(/\s+/g, "-").toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function AddItemModal({ open, onClose, onSave }: AddItemModalProps) {
  const [type, setType] = useState<(typeof types)[number]["key"]>("article");
  const [typeTouched, setTypeTouched] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const playlistDetected = isYouTubePlaylistUrl(url);

  useEffect(() => {
    if (!open) {
      setType("article");
      setTypeTouched(false);
      setTitle("");
      setUrl("");
      setTags("");
      setExcerpt("");
      setTitleError(false);
    }
  }, [open]);

  async function handleSave() {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }

    try {
      setSaving(true);
      await onSave({
        type,
        title: title.trim(),
        url: type === "note" ? undefined : url.trim() || undefined,
        excerpt: excerpt.trim() || undefined,
        tags: normalizeTags(tags),
      });
      onClose();
      toast.success("Item saved.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Item"
      footer={
        <>
          <button className="btn-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-save" type="button" onClick={handleSave}>
            {saving ? "Saving..." : "Save Item"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Type</label>
        <div className="type-tabs">
          {types.map((item) => (
            <button
              className={`type-tab ${type === item.key ? "active" : ""}`}
              key={item.key}
              type="button"
              onClick={() => {
                setTypeTouched(true);
                setType(item.key);
              }}
            >
              <span className="type-tab-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Title *</label>
        <input
          autoFocus
          className={titleError ? "err" : ""}
          placeholder="Enter a title..."
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (titleError && event.target.value.trim()) {
              setTitleError(false);
            }
          }}
        />
      </div>

      {type !== "note" ? (
        <div className="field">
          <label>
            URL / Source{" "}
            {playlistDetected ? (
              <span className="field-hint">(YouTube playlist detected)</span>
            ) : null}
          </label>
          <input
            placeholder="https://..."
            value={url}
            onChange={(event) => {
              const nextUrl = event.target.value;
              setUrl(nextUrl);

              if (!typeTouched) {
                setType(inferItemTypeFromUrl(nextUrl) ?? "article");
              }
            }}
          />
          {playlistDetected ? (
            <div className="field-note">
              This will be saved as a YouTube playlist with in-app playback and a running
              completion report.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="field">
        <label>
          Tags <span className="field-hint">(comma separated)</span>
        </label>
        <input
          placeholder="machine-learning, ai, research"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
      </div>

      <div className="field">
        <label>Excerpt / Description</label>
        <textarea
          placeholder="Brief description or key excerpt..."
          value={excerpt}
          onChange={(event) => setExcerpt(event.target.value)}
        />
      </div>
    </Modal>
  );
}
