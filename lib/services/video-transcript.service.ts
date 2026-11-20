import { getYouTubeVideoId } from "@/lib/utils/youtube";
import { hasUsableTranscript, type CaptionFailure, type CaptionResult } from "@/lib/utils/video-transcript";

/** Storage and YouTube calls the service needs; injected so the rules are testable without either. */
export type VideoTranscriptDeps = {
  findOwnedVideo: (
    assetId: string,
    ownerId: string,
  ) => Promise<{ id: string; kind: string; sourceUrl: string | null; transcript: string | null } | null>;
  saveTranscript: (assetId: string, transcript: string) => Promise<void>;
  fetchCaptions: (videoId: string) => Promise<CaptionResult>;
};

export type VideoTranscriptResult =
  | { status: "saved"; chars: number }
  | { status: "exists" }
  /** Not a single YouTube video (another site, a playlist, or not a video). */
  | { status: "unsupported" }
  | { status: "unavailable"; reason: CaptionFailure };

export function createVideoTranscriptService(deps: VideoTranscriptDeps) {
  /**
   * Makes sure the user's YouTube video has its transcript saved, so Rangan
   * can search and summarize it. A saved transcript is never fetched again;
   * a too-short placeholder is replaced.
   */
  return async function ensureVideoTranscript(userId: string, assetId: string): Promise<VideoTranscriptResult> {
    const video = await deps.findOwnedVideo(assetId, userId);
    if (!video) throw Object.assign(new Error("Asset not found."), { status: 404 });
    if (hasUsableTranscript(video.transcript)) return { status: "exists" };

    const videoId = video.kind === "video" ? getYouTubeVideoId(video.sourceUrl) : null;
    if (!videoId) return { status: "unsupported" };

    const captions = await deps.fetchCaptions(videoId);
    if (!captions.ok) return { status: "unavailable", reason: captions.reason };

    await deps.saveTranscript(video.id, captions.text);
    return { status: "saved", chars: captions.text.length };
  };
}
