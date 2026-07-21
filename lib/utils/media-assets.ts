export type UploadableAssetKind = "pdf" | "video" | "image" | "audio";

export const WORKSPACE_UPLOAD_ACCEPT =
  "application/pdf,.pdf,image/*,video/*,audio/*";

function getExtension(filename?: string) {
  if (!filename) return "";

  const segments = filename.toLowerCase().split(".");
  return segments.length > 1 ? segments.at(-1) ?? "" : "";
}

export function inferUploadAssetKind(
  mimeType?: string | null,
  filename?: string | null,
): UploadableAssetKind | null {
  const normalizedMimeType = (mimeType ?? "").toLowerCase();

  if (normalizedMimeType === "application/pdf") {
    return "pdf";
  }

  if (normalizedMimeType.startsWith("image/")) {
    return "image";
  }

  if (normalizedMimeType.startsWith("video/")) {
    return "video";
  }

  if (normalizedMimeType.startsWith("audio/")) {
    return "audio";
  }

  const extension = getExtension(filename ?? undefined);
  if (extension === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(extension)) {
    return "image";
  }
  if (["mp4", "mov", "m4v", "webm", "ogg", "avi", "mkv"].includes(extension)) {
    return "video";
  }
  if (["mp3", "wav", "m4a", "aac", "oga", "flac"].includes(extension)) {
    return "audio";
  }

  return null;
}

export function getAssetKindLabel(kind: string) {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "video":
      return "Video";
    case "image":
      return "Image";
    case "audio":
      return "Audio";
    case "webpage":
      return "Web Page";
    case "snapshot":
      return "Snapshot";
    default:
      return "Asset";
  }
}

export function getViewerTypeForAssetKind(kind: string): "pdf" | "video" | "webpage" | null {
  if (kind === "pdf") return "pdf";
  if (kind === "video" || kind === "audio") return "video";
  if (kind === "webpage") return "webpage";
  return null;
}
