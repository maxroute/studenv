"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/modal";
import type { ItemRecord } from "@/types";

type CreateCollectionModalProps = {
  open: boolean;
  items: ItemRecord[];
  initialSelectedIds?: string[];
  onClose: () => void;
  onSave: (payload: {
    title: string;
    description?: string;
    itemIds: string[];
  }) => Promise<void>;
};

function sortItems(items: ItemRecord[]) {
  return [...items].sort((a, b) => a.title.localeCompare(b.title));
}

export function CreateCollectionModal({
  open,
  items,
  initialSelectedIds = [],
  onClose,
  onSave,
}: CreateCollectionModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // The modal stays mounted while closed, so autoFocus would grab focus as soon as
  // the Library opened and, on phones, pop up the keyboard. Focus only on open,
  // and only with a mouse: on touch the keyboard waits until the field is tapped.
  useEffect(() => {
    if (open && window.matchMedia("(pointer: fine)").matches) titleRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setQuery("");
      setSelectedIds([]);
      setSaving(false);
      setTitleError(false);
      return;
    }

    setSelectedIds([...new Set(initialSelectedIds)]);
  }, [initialSelectedIds, open]);

  const filteredItems = useMemo(() => {
    const sorted = sortItems(items);

    if (!query.trim()) {
      return sorted;
    }

    const normalizedQuery = query.trim().toLowerCase();

    return sorted.filter((item) => {
      const source = item.url ?? "";
      const tags = item.tags.map((tag) => tag.name).join(" ");

      return (
        item.title.toLowerCase().includes(normalizedQuery) ||
        source.toLowerCase().includes(normalizedQuery) ||
        tags.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [items, query]);

  async function handleSave() {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }

    try {
      setSaving(true);
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        itemIds: selectedIds,
      });
      onClose();
      toast.success("Collection created.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function toggleItem(itemId: string) {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((entry) => entry !== itemId)
        : [...current, itemId],
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Collection"
      width="lg"
      bodyClassName="collection-modal-body"
      footer={
        <>
          <button className="btn-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-save" type="button" onClick={handleSave}>
            {saving ? "Saving..." : "Save Collection"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Collection Name *</label>
        <input
          ref={titleRef}
          className={titleError ? "err" : ""}
          placeholder="Reading sprint, Marvel lore, Research stack..."
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (titleError && event.target.value.trim()) {
              setTitleError(false);
            }
          }}
        />
      </div>

      <div className="field">
        <label>Description</label>
        <textarea
          placeholder="Optional context for what belongs in this collection..."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="collection-modal-section">
        <div className="collection-modal-head">
          <label htmlFor="collectionItemSearch">Pick Items</label>
          <span>{selectedIds.length} selected</span>
        </div>

        <input
          className="collection-item-search"
          id="collectionItemSearch"
          placeholder="Search items by title, link, or tag..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="collection-picker-list">
          {filteredItems.length ? (
            filteredItems.map((item) => {
              const selected = selectedIds.includes(item.id);

              return (
                <button
                  className={`collection-picker-item ${selected ? "active" : ""}`}
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item.id)}
                >
                  <span className="collection-picker-check">
                    {selected ? "x" : ""}
                  </span>
                  <div className="collection-picker-copy">
                    <div className="collection-picker-title-row">
                      <span className={`type-badge ${item.type}`}>{item.type}</span>
                      <span className="collection-picker-title">{item.title}</span>
                    </div>
                    <div className="collection-picker-meta">
                      {item.tags.length
                        ? item.tags.map((tag) => tag.name).join(", ")
                        : item.url ?? "No tags yet"}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="collection-picker-empty">
              No items match your search yet.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
