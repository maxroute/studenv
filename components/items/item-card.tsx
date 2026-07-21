"use client";

import clsx from "clsx";
import { Star } from "lucide-react";
import { usePlaybackStore } from "@/hooks/usePlaybackStore";
import { getYouTubePlaylistProgressReport } from "@/lib/utils/youtube";
import type { ItemRecord } from "@/types";

type ItemCardProps = {
  item: ItemRecord;
  index: number;
  selected: boolean;
  view: "grid" | "list";
  onSelect: () => void;
  onToggleStar: () => void;
};

const statusLabel = {
  unread: "Unread",
  reading: "Reading",
  done: "Done",
};

export function ItemCard({
  item,
  index,
  selected,
  view,
  onSelect,
  onToggleStar,
}: ItemCardProps) {
  const savedProgress = usePlaybackStore((state) => state.progressByItemId[item.id]);
  const playlistReport = getYouTubePlaylistProgressReport(item.url, savedProgress?.playlist);

  return (
    <div
      className={clsx(
        "card",
        item.type,
        selected && "selected",
        view === "list" && "list-mode",
      )}
      role="button"
      tabIndex={0}
      style={{ animationDelay: `${index * 0.035}s` }}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="card-type">
        <span className={`type-badge ${item.type}`}>{item.type}</span>
        {playlistReport ? <span className="playlist-mini-badge">playlist</span> : null}
        <button
          className={`star-btn ${item.starred ? "starred" : ""}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleStar();
          }}
          aria-label={item.starred ? "Unstar item" : "Star item"}
        >
          <Star size={14} fill={item.starred ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="card-title">{item.title}</div>
      <div className="card-excerpt">{item.excerpt ?? ""}</div>
      {playlistReport ? (
        <div className="card-playlist-report">
          <div className="card-playlist-head">
            <span>Playlist Progress</span>
            <strong>
              {playlistReport.totalVideos
                ? `${playlistReport.percent}% complete`
                : "Saved"}
            </strong>
          </div>
          <div className="card-playlist-bar">
            <div
              className="card-playlist-fill"
              style={{ width: `${playlistReport.totalVideos ? playlistReport.percent : 0}%` }}
            />
          </div>
          <div className="card-playlist-meta">
            {playlistReport.totalVideos
              ? `${playlistReport.completedCount}/${playlistReport.totalVideos} videos | ${playlistReport.status}`
              : "Start playing to map out the playlist."}
          </div>
        </div>
      ) : null}
      <div className="card-tags">
        {item.tags.map((tag) => (
          <span className="tag" key={tag.id}>
            {tag.name}
          </span>
        ))}
      </div>
      <div className="card-footer">
        <div className={`status-pill ${item.status}`}>
          <div className="status-dot" />
          {statusLabel[item.status]}
        </div>
        <div className="card-date">
          {new Date(item.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>
    </div>
  );
}
