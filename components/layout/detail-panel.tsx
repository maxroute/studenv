"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePlaybackStore } from "@/hooks/usePlaybackStore";
import { ExternalLink, Layout, Star, Trash2, X } from "lucide-react";
import { getYouTubePlaylistProgressReport } from "@/lib/utils/youtube";
import type { CollectionRecord, ItemRecord, ItemStatus } from "@/types";

type DetailPanelProps = {
  item: ItemRecord | null;
  /** True once `item.notes` comes from the full item, not a list row (which has no notes). */
  notesLoaded: boolean;
  collections: CollectionRecord[];
  /** Resolves to false when the save failed. */
  onUpdate: (payload: Partial<ItemRecord>) => Promise<boolean>;
  onToggleCollection: (collection: CollectionRecord) => void;
  onDelete: () => void;
  onOpenSource: () => void;
  onClose?: () => void;
  openSourceLabel?: string;
};

const statuses: Array<{ key: ItemStatus; label: string }> = [
  { key: "unread", label: "Unread" },
  { key: "reading", label: "Reading" },
  { key: "done", label: "Done" },
];

function dedupeTags(tags: ItemRecord["tags"]) {
  const seen = new Set<string>();

  return tags.filter((tag) => {
    if (seen.has(tag.name)) {
      return false;
    }

    seen.add(tag.name);
    return true;
  });
}

export function DetailPanel({
  item,
  notesLoaded,
  collections,
  onUpdate,
  onToggleCollection,
  onDelete,
  onOpenSource,
  onClose,
  openSourceLabel = "Open Source",
}: DetailPanelProps) {
  const router = useRouter();
  // Draft notes, tagged with the item they belong to so a draft is never saved
  // onto another item while the selection changes.
  const [notesDraft, setNotesDraft] = useState<{ itemId: string; text: string } | null>(null);
  // The notes value last loaded from or sent to the server for the draft's item.
  const savedNotesRef = useRef<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState(item?.url ?? "");
  const [saved, setSaved] = useState(false);
  const [sourceSaved, setSourceSaved] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [openingWorkspace, setOpeningWorkspace] = useState(false);
  const savedProgress = usePlaybackStore((state) =>
    item ? state.progressByItemId[item.id] : undefined,
  );
  const playlistReport = getYouTubePlaylistProgressReport(item?.url, savedProgress?.playlist);

  const itemId = item?.id;
  const loadedNotes = item?.notes ?? "";

  // Seed the draft once per item, and only from the full item. Later refreshes
  // of `item.notes` must not replace what the user is typing.
  useEffect(() => {
    if (!itemId || !notesLoaded) {
      setNotesDraft(null);
      savedNotesRef.current = null;
      return;
    }
    setNotesDraft((draft) => {
      if (draft?.itemId === itemId) return draft;
      savedNotesRef.current = loadedNotes;
      return { itemId, text: loadedNotes };
    });
  }, [itemId, notesLoaded, loadedNotes]);

  useEffect(() => {
    setSourceUrl(item?.url ?? "");
  }, [item?.id]);

  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!itemId || !notesDraft || notesDraft.itemId !== itemId) {
      return;
    }
    const text = notesDraft.text;
    if (text === savedNotesRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const previous = savedNotesRef.current;
      savedNotesRef.current = text;
      void onUpdateRef.current({ notes: text }).then((ok) => {
        if (!ok) {
          // Let the next edit retry instead of believing this text is stored.
          if (savedNotesRef.current === text) savedNotesRef.current = previous;
          return;
        }
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1800);
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [notesDraft, itemId]);

  if (!item) {
    return (
      <aside className="detail" id="detailPanel">
        <button
          aria-label="Close details"
          className="detail-close-btn"
          title="Close"
          type="button"
          onClick={onClose}
        >
          <X size={17} />
        </button>
        <div className="detail-empty">
          <div className="detail-empty-icon">[]</div>
          <div className="detail-empty-text">Select an item to view details</div>
        </div>
      </aside>
    );
  }

  const sourceLabel = item.url
    ? (() => {
        try {
          return `${new URL(item.url).hostname} - ${new Date(item.createdAt).getFullYear()}`;
        } catch {
          return item.url;
        }
      })()
    : item.type === "note"
      ? "Personal note"
      : "Missing source URL";

  function saveSourceUrl() {
    const currentItem = item;

    if (!currentItem) {
      return;
    }

    const nextUrl = sourceUrl.trim();
    const currentUrl = currentItem.url ?? "";

    if (nextUrl === currentUrl) {
      return;
    }

    onUpdate({ url: nextUrl } as Partial<ItemRecord>);
    setSourceSaved(true);
    window.setTimeout(() => setSourceSaved(false), 1800);
  }

  return (
    <aside className="detail" id="detailPanel">
      <button
        aria-label="Close details"
        className="detail-close-btn"
        title="Close"
        type="button"
        onClick={onClose}
      >
        <X size={17} />
      </button>
      <div className="detail-inner">
        <div className="detail-header">
          <div className="detail-type-row">
            <span className={`type-badge ${item.type}`}>{item.type}</span>
            <span className="detail-source">{sourceLabel}</span>
          </div>
          <div className="detail-title">{item.title}</div>
        </div>

        <div className="detail-meta">
          {item.type !== "note" ? (
            <div className="meta-row">
              <span className="meta-key">URL</span>
              <div className="meta-url-editor">
                <input
                  className="meta-url-input"
                  placeholder="https://..."
                  value={sourceUrl}
                  onBlur={saveSourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      (event.target as HTMLInputElement).blur();
                    }

                    if (event.key === "Escape") {
                      setSourceUrl(item.url ?? "");
                      (event.target as HTMLInputElement).blur();
                    }
                  }}
                />
                <span className={`notes-saved ${sourceSaved ? "show" : ""}`}>Saved</span>
              </div>
            </div>
          ) : null}

          <div className="meta-row">
            <span className="meta-key">Added</span>
            <span className="meta-val">
              {new Date(item.createdAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>

          {playlistReport ? (
            <div className="meta-row meta-row-start">
              <span className="meta-key">Playlist</span>
              <div className="meta-playlist-report">
                <div className="meta-playlist-head">
                  <strong>
                    {playlistReport.totalVideos
                      ? `${playlistReport.percent}% complete`
                      : "Playlist saved"}
                  </strong>
                  <span>{playlistReport.status}</span>
                </div>
                <div className="meta-playlist-bar">
                  <div
                    className="meta-playlist-fill"
                    style={{ width: `${playlistReport.totalVideos ? playlistReport.percent : 0}%` }}
                  />
                </div>
                <div className="meta-playlist-summary">
                  {playlistReport.totalVideos
                    ? `${playlistReport.completedCount}/${playlistReport.totalVideos} videos completed`
                    : "Start playback to build the playlist progress report."}
                </div>
              </div>
            </div>
          ) : null}

          {item.excerpt ? (
            <div className="meta-row">
              <span className="meta-key">Excerpt</span>
              <span className="meta-val">{item.excerpt}</span>
            </div>
          ) : null}

          <div className="meta-row">
            <span className="meta-key">Tags</span>
            <div className="meta-tags">
              {item.tags.map((tag) => (
                <button
                  className="meta-tag-item"
                  key={tag.id}
                  title="Remove tag"
                  type="button"
                  onClick={() =>
                    onUpdate({
                      tags: item.tags.filter((entry) => entry.id !== tag.id),
                    } as Partial<ItemRecord>)
                  }
                >
                  {tag.name}
                </button>
              ))}
              {addingTag ? (
                <input
                  autoFocus
                  className="tag-input-inline"
                  placeholder="tag..."
                  value={tagDraft}
                  onBlur={() => {
                    const value = tagDraft.trim().replace(/\s+/g, "-").toLowerCase();

                    if (value) {
                      onUpdate({
                        tags: dedupeTags([
                          ...item.tags,
                          {
                            id: `${Date.now()}`,
                            name: value,
                            color: "#f5a623",
                          },
                        ]),
                      } as Partial<ItemRecord>);
                    }

                    setTagDraft("");
                    setAddingTag(false);
                  }}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      (event.target as HTMLInputElement).blur();
                    }

                    if (event.key === "Escape") {
                      setTagDraft("");
                      setAddingTag(false);
                    }
                  }}
                />
              ) : (
                <button
                  className="tag-add-btn"
                  type="button"
                  onClick={() => setAddingTag(true)}
                >
                  + tag
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="detail-status">
          <div className="detail-subsection-head">Collections</div>
          {collections.length ? (
            <div className="collection-chip-list">
              {collections.map((collection) => {
                const active = collection.itemIds.includes(item.id);

                return (
                  <button
                    className={`collection-chip ${active ? "active" : ""}`}
                    key={collection.id}
                    type="button"
                    onClick={() => onToggleCollection(collection)}
                  >
                    <span>{collection.title}</span>
                    <span className="collection-chip-count">{collection.itemCount}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="detail-inline-copy">
              Create a collection from the sidebar to group items together.
            </div>
          )}
        </div>

        <div className="detail-status">
          <div className="status-label">Learning Status</div>
          <div className="status-options">
            {statuses.map((status) => (
              <button
                className={`status-opt ${item.status === status.key ? "active" : ""}`}
                key={status.key}
                type="button"
                onClick={() => onUpdate({ status: status.key } as Partial<ItemRecord>)}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>

        {item.type === "note" && item.noteId ? (
          <div className="detail-notes">
            <div className="notes-label">Note</div>
            {item.excerpt ? <p className="detail-note-preview">{item.excerpt}</p> : null}
            <button
              className="btn-primary detail-open-note"
              type="button"
              onClick={() => router.push(`/notes/${item.noteId}`)}
            >
              Open note
            </button>
          </div>
        ) : (
        <div className="detail-notes">
          <div className="notes-label">
            My Notes
            <span className={`notes-saved ${saved ? "show" : ""}`}>Saved</span>
          </div>
          <textarea
            aria-busy={!notesDraft}
            className="notes-area"
            placeholder={notesDraft ? "Add your thoughts, highlights, takeaways..." : "Loading notes..."}
            readOnly={!notesDraft}
            value={notesDraft?.text ?? ""}
            onChange={(event) => {
              if (!itemId) return;
              setNotesDraft({ itemId, text: event.target.value });
            }}
          />
        </div>
        )}

        <div className="detail-actions">
          <button
            aria-label={openSourceLabel}
            className="btn-ghost btn-icon-action btn-open"
            id="openSrcBtn"
            title={openSourceLabel}
            type="button"
            onClick={onOpenSource}
          >
            <ExternalLink size={17} />
          </button>
          <button
            aria-label={openingWorkspace ? "Opening workspace" : "Workspace"}
            className="btn-ghost btn-icon-action"
            title={openingWorkspace ? "Opening workspace..." : "Workspace"}
            type="button"
            onClick={() => {
              if (!item || openingWorkspace) return;
              setOpeningWorkspace(true);
              router.push(`/workspaces/open?itemId=${item.id}`);
            }}
            disabled={openingWorkspace}
          >
            <Layout size={17} />
          </button>
          <button
            aria-label={item.starred ? "Unstar" : "Star"}
            className="btn-ghost btn-icon-action"
            id="dStarBtn"
            title={item.starred ? "Unstar" : "Star"}
            type="button"
            onClick={() => onUpdate({ starred: !item.starred } as Partial<ItemRecord>)}
          >
            <Star size={17} fill={item.starred ? "currentColor" : "none"} />
          </button>
          <button
            aria-label="Delete"
            className="btn-ghost btn-icon-action btn-del"
            id="dDelBtn"
            title="Delete"
            type="button"
            onClick={onDelete}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
