"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Film, ImageIcon, Music, Paperclip } from "lucide-react";
import { groupFileDownloadUrl } from "@/lib/study-groups/file-delivery";
import type { StudyGroupAttachmentRecord, StudyGroupFileRecord } from "@/types";

export function initialsFor(name?: string | null, username?: string | null) {
  const source = (name || username || "Group Member").trim();
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A round picture (a person's profile photo or a group photo) that falls back
 * to initials when there is none or it can't load.
 */
export function PhotoBadge({
  src,
  name,
  username,
  className,
  children,
}: {
  src: string | null | undefined;
  name?: string | null;
  username?: string | null;
  className: string;
  children?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showPhoto = Boolean(src) && !failed;

  return (
    <div className={`${className} ${showPhoto ? "has-photo" : ""}`}>
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by this app behind sign-in; next/image can't forward the session cookie
        <img src={src ?? undefined} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        initialsFor(name, username)
      )}
      {children}
    </div>
  );
}

export function formatFileSize(value?: number | null) {
  if (!value) {
    return "";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function FileKindIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon aria-hidden="true" />;
  if (mimeType.startsWith("video/")) return <Film aria-hidden="true" />;
  if (mimeType.startsWith("audio/")) return <Music aria-hidden="true" />;
  if (mimeType === "application/pdf" || mimeType.startsWith("text/")) return <FileText aria-hidden="true" />;
  return <Paperclip aria-hidden="true" />;
}

function fileTypeLabel(mimeType: string, name: string) {
  const extension = /\.([a-z0-9]{1,6})$/i.exec(name)?.[1];
  if (extension) return extension.toUpperCase();
  return mimeType.split("/")[1]?.toUpperCase() || "FILE";
}

/**
 * A shared file. Tapping the card opens it (a PDF, picture or video opens in
 * the browser; other types download); the arrow always downloads.
 */
export function GroupFileCard({
  file,
  detail,
}: {
  file: Pick<StudyGroupAttachmentRecord, "url" | "name" | "mimeType" | "sizeBytes">;
  detail?: string;
}) {
  const name = file.name || "Shared file";
  const meta = [fileTypeLabel(file.mimeType, name), formatFileSize(file.sizeBytes), detail]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="file-card">
      <a
        href={file.url}
        target="_blank"
        rel="noopener"
        className="file-open"
        aria-label={`Open ${name}`}
      >
        <div className="file-icon">
          <FileKindIcon mimeType={file.mimeType} />
        </div>
        <div className="file-info">
          <div className="file-name">{name}</div>
          <div className="file-size">{meta}</div>
        </div>
      </a>
      <div className="file-btns">
        <a
          href={file.url}
          target="_blank"
          rel="noopener"
          className="file-btn file-btn-open"
        >
          Open
        </a>
        <a
          href={groupFileDownloadUrl(file.url)}
          download={name}
          className="file-btn"
          aria-label={`Download ${name}`}
          title="Download"
        >
          <Download aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

export function SharedFilesList({
  files,
  loading,
  failed,
  onRetry,
}: {
  files: StudyGroupFileRecord[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  if (!files && failed) {
    return (
      <p className="shared-files-empty">
        Couldn&apos;t load the files.{" "}
        <button type="button" className="underline" onClick={onRetry}>
          Try again
        </button>
      </p>
    );
  }

  if (!files || (loading && files.length === 0)) {
    return <p className="shared-files-empty">Loading files…</p>;
  }

  if (files.length === 0) {
    return <p className="shared-files-empty">Files sent in the chat will be listed here.</p>;
  }

  return (
    <div className="shared-files-list">
      {files.map((file) => (
        <GroupFileCard
          key={file.id}
          file={file}
          detail={`${file.authorName || file.authorUsername || "Study member"}, ${new Date(file.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}`}
        />
      ))}
    </div>
  );
}
