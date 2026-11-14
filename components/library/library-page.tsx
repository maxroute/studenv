"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";
import { formatBytes } from "@/lib/utils/format-bytes";
import { useAppStore } from "@/hooks/useAppStore";
import { useCollections } from "@/hooks/useCollections";
import { useItems } from "@/hooks/useItems";
import { openItemPage } from "@/lib/client/open-item-page";
import type { ItemRecord } from "@/types";

export type LibrarySection = "boards" | "files" | "tags" | "collections" | "storage";

type LibraryFile = {
  ref: string;
  title: string;
  kind: "pdf" | "video" | "link" | "image" | "audio";
  url: string | null;
  sizeBytes: number | null;
  createdAt: string;
  usedIn: Array<{ type: "page" | "board"; id: string; title: string }>;
};
type Board = { id: string; title: string; updatedAt: string; pages: Array<{ id: string; title: string }> };
type Storage = { usedBytes: number; limitBytes: number | null; largest: Array<{ ref: string; title: string; kind: string; sizeBytes: number }> };

async function dataFetcher(url: string) {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Not available");
  return json.data;
}

const KIND_LABEL: Record<string, string> = { pdf: "PDF", video: "Video", link: "Link", image: "Image", audio: "Audio" };
const FILE_FILTERS = [
  { key: null, label: "All" },
  { key: "pdf", label: "PDFs" },
  { key: "video", label: "Videos" },
  { key: "link", label: "Links" },
  { key: "image", label: "Images" },
] as const;

function UsedIn({ uses }: { uses: LibraryFile["usedIn"] }) {
  if (uses.length === 0) return <span className="library-muted">Not used yet</span>;
  return (
    <span className="library-chips">
      {uses.map((use) => (
        <Link key={`${use.type}:${use.id}`} className="library-chip" href={use.type === "page" ? `/notes/${use.id}` : `/workspaces/${use.id}`}>
          <span aria-hidden="true">{use.type === "page" ? "✎" : "⬚"}</span> {use.title}
        </Link>
      ))}
    </span>
  );
}

function ItemRow({ item }: { item: ItemRecord }) {
  const router = useRouter();
  return (
    <button type="button" className="library-row" onClick={() => void openItemPage(item, router.push)}>
      <span className="library-kind">{item.type === "note" ? "Page" : KIND_LABEL[item.type === "article" ? "link" : item.type] ?? item.type}</span>
      <span className="library-title">{item.title || "Untitled"}</span>
      <span className="library-muted">{item.status === "reading" ? "Reading" : item.status === "done" ? "Done" : "Unread"}</span>
    </button>
  );
}

/** The full list behind a sidebar heading: boards, files, tags, collections or storage. */
export function LibraryPage({ section }: { section: LibrarySection }) {
  const kind = useSearchParams().get("kind");
  const router = useRouter();
  const { items } = useItems({});
  const { collections } = useCollections();
  const { setNav, toggleTag, filters } = useAppStore();
  const boards = useSWR<Board[]>(section === "boards" ? "/api/library/boards" : null, dataFetcher);
  const files = useSWR<LibraryFile[]>(section === "files" ? "/api/library/files" : null, dataFetcher);
  const storage = useSWR<Storage>(section === "storage" ? "/api/library/storage" : null, dataFetcher);

  const tags = useMemo(() => {
    const byName = new Map<string, ItemRecord[]>();
    for (const item of items) for (const tag of item.tags) byName.set(tag.name, [...(byName.get(tag.name) ?? []), item]);
    return [...byName.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  const title = { boards: "Boards", files: "Files", tags: "Tags", collections: "Collections", storage: "Storage" }[section];

  return (
    <div className="library-page">
      <h1>{title}</h1>

      {section === "boards" ? (
        boards.error ? <p className="library-muted">Boards could not be loaded.</p> : !boards.data ? <p className="library-muted">Loading…</p> : boards.data.length === 0 ? (
          <p className="library-muted">No boards yet. Open a page and choose Board to start one.</p>
        ) : (
          <div className="library-list">
            {boards.data.map((board) => (
              <div key={board.id} className="library-card">
                <Link className="library-card-title" href={`/workspaces/${board.id}`}>⬚ {board.title}</Link>
                <span className="library-muted">Edited {new Date(board.updatedAt).toLocaleDateString()}</span>
                {board.pages.length ? (
                  <span className="library-chips">
                    {board.pages.map((page) => (
                      <Link key={page.id} className="library-chip" href={`/notes/${page.id}`}>✎ {page.title}</Link>
                    ))}
                  </span>
                ) : (
                  <span className="library-muted">No pages on it yet</span>
                )}
              </div>
            ))}
          </div>
        )
      ) : null}

      {section === "files" ? (
        <>
          <div className="library-filters" role="group" aria-label="File type">
            {FILE_FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                aria-pressed={kind === filter.key}
                className={`library-filter${kind === filter.key ? " active" : ""}`}
                onClick={() => router.replace(filter.key ? `/library/files?kind=${filter.key}` : "/library/files")}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {files.error ? <p className="library-muted">Files could not be loaded.</p> : !files.data ? <p className="library-muted">Loading…</p> : (() => {
            const shown = files.data.filter((file) => !kind || file.kind === kind);
            if (shown.length === 0) return <p className="library-muted">No files here yet. Add them to a page with / or by dropping them in.</p>;
            return (
              <div className="library-table" role="table">
                <div className="library-table-head" role="row">
                  <span role="columnheader">File</span>
                  <span role="columnheader">Used in</span>
                  <span role="columnheader">Size</span>
                </div>
                {shown.map((file) => (
                  <div key={file.ref} className="library-table-row" role="row">
                    <span className="library-file" role="cell">
                      <span className="library-kind">{KIND_LABEL[file.kind]}</span>
                      {file.ref.startsWith("item:") ? (
                        <button type="button" className="library-title library-title-button" onClick={() => void openItemPage({ id: file.ref.slice(5) }, router.push)}>
                          {file.title}
                        </button>
                      ) : (
                        <span className="library-title">{file.title}</span>
                      )}
                    </span>
                    <span role="cell"><UsedIn uses={file.usedIn} /></span>
                    <span role="cell" className="library-muted">{file.sizeBytes ? formatBytes(file.sizeBytes) : file.kind === "link" || file.kind === "video" ? "link" : "—"}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      ) : null}

      {section === "tags" ? (
        tags.length === 0 ? <p className="library-muted">No tags yet. Add them from a page&rsquo;s chips.</p> : (
          <div className="library-list">
            {tags.map(([name, tagged]) => (
              <div key={name} className="library-card">
                <button
                  type="button"
                  className="library-card-title library-title-button"
                  onClick={() => {
                    router.push("/shelf");
                    if (filters.tag !== name) toggleTag(name);
                  }}
                >
                  #{name} <span className="library-muted">{tagged.length}</span>
                </button>
                <div>{tagged.map((item) => <ItemRow key={item.id} item={item} />)}</div>
              </div>
            ))}
          </div>
        )
      ) : null}

      {section === "collections" ? (
        collections.length === 0 ? <p className="library-muted">No collections yet. Create one with + New in the sidebar.</p> : (
          <div className="library-list">
            {collections.map((collection) => (
              <div key={collection.id} className="library-card">
                <button
                  type="button"
                  className="library-card-title library-title-button"
                  onClick={() => {
                    router.push("/shelf");
                    setNav(`collection:${collection.id}`);
                  }}
                >
                  {collection.title} <span className="library-muted">{collection.itemCount}</span>
                </button>
                <div>
                  {items.filter((item) => collection.itemIds.includes(item.id)).map((item) => <ItemRow key={item.id} item={item} />)}
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}

      {section === "storage" ? (
        storage.error ? <p className="library-muted">Storage could not be loaded.</p> : !storage.data ? <p className="library-muted">Loading…</p> : (
          <>
            <div className="library-storage">
              <div className="library-storage-numbers">
                <strong>{formatBytes(storage.data.usedBytes)}</strong>
                {storage.data.limitBytes ? <span className="library-muted"> of {formatBytes(storage.data.limitBytes)} used</span> : <span className="library-muted"> used</span>}
              </div>
              {storage.data.limitBytes ? (
                <div className="storage-bar library-storage-bar">
                  <div
                    className={`storage-fill${storage.data.usedBytes / storage.data.limitBytes >= 0.9 ? " full" : ""}`}
                    style={{ width: `${Math.min(100, (storage.data.usedBytes / storage.data.limitBytes) * 100)}%` }}
                  />
                </div>
              ) : null}
              <p className="library-muted">Uploaded files count. Links (YouTube, websites) and page text don&rsquo;t.</p>
            </div>
            <h2 className="library-subhead">Largest files</h2>
            {storage.data.largest.length === 0 ? <p className="library-muted">No uploaded files yet.</p> : (
              <div className="library-table" role="table">
                {storage.data.largest.map((file) => (
                  <div key={file.ref} className="library-table-row compact" role="row">
                    <span className="library-file" role="cell">
                      <span className="library-kind">{KIND_LABEL[file.kind] ?? file.kind}</span>
                      <span className="library-title">{file.title}</span>
                    </span>
                    <span role="cell" className="library-muted">{formatBytes(file.sizeBytes)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      ) : null}
    </div>
  );
}
