const youtubeHosts = new Set([
  "youtu.be",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

function hasPlayableYouTubeTarget(source: {
  videoId: string | null;
  playlistId: string | null;
}) {
  return Boolean(source.videoId || source.playlistId);
}

export function normalizeYouTubeUrl(url: string) {
  return url.startsWith("http") ? url : `https://${url}`;
}

function cleanVideoId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{11}$/.test(trimmed) ? trimmed : null;
}

function cleanPlaylistId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

function parsePlaylistIndex(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export type YouTubePlaybackSource = {
  normalizedUrl: string;
  videoId: string | null;
  playlistId: string | null;
  playlistIndex: number | null;
};

export type YouTubePlaylistProgress = {
  currentIndex: number;
  furthestIndex: number;
  totalVideos: number;
  videoIds: string[];
  videosById: Record<string, YouTubePlaylistVideoProgress>;
  updatedAt: number;
};

export type YouTubePlaylistVideoProgress = {
  videoId: string;
  seconds: number;
  duration?: number;
  completed: boolean;
  updatedAt: number;
};

export type YouTubePlaylistVideoProgressInput = Omit<
  YouTubePlaylistVideoProgress,
  "updatedAt"
>;

export type YouTubePlaylistProgressInput = Omit<
  YouTubePlaylistProgress,
  "updatedAt" | "videosById"
> & {
  videosById?: Record<string, YouTubePlaylistVideoProgressInput>;
};

export function getYouTubePlaybackSource(url?: string | null): YouTubePlaybackSource | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(normalizeYouTubeUrl(url));
    const hostname = parsed.hostname.toLowerCase();

    if (!youtubeHosts.has(hostname)) {
      return null;
    }

    const playlistId = cleanPlaylistId(parsed.searchParams.get("list"));
    const playlistIndex = parsePlaylistIndex(parsed.searchParams.get("index"));

    if (hostname === "youtu.be") {
      const [segment] = parsed.pathname.split("/").filter(Boolean);
      const source = {
        normalizedUrl: parsed.toString(),
        videoId: cleanVideoId(segment),
        playlistId,
        playlistIndex,
      };
      return hasPlayableYouTubeTarget(source) ? source : null;
    }

    if (parsed.pathname === "/watch") {
      const source = {
        normalizedUrl: parsed.toString(),
        videoId: cleanVideoId(parsed.searchParams.get("v")),
        playlistId,
        playlistIndex,
      };
      return hasPlayableYouTubeTarget(source) ? source : null;
    }

    if (parsed.pathname === "/playlist") {
      const source = {
        normalizedUrl: parsed.toString(),
        videoId: null,
        playlistId,
        playlistIndex,
      };
      return hasPlayableYouTubeTarget(source) ? source : null;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    const route = segments[0]?.toLowerCase();

    if (route === "embed" || route === "shorts" || route === "live") {
      const source = {
        normalizedUrl: parsed.toString(),
        videoId: cleanVideoId(segments[1]),
        playlistId,
        playlistIndex,
      };
      return hasPlayableYouTubeTarget(source) ? source : null;
    }

    return null;
  } catch {
    return null;
  }
}

export function getYouTubeVideoId(url?: string | null) {
  return getYouTubePlaybackSource(url)?.videoId ?? null;
}

export function isYouTubePlaylistUrl(url?: string | null) {
  return Boolean(getYouTubePlaybackSource(url)?.playlistId);
}

export function isYouTubeUrl(url?: string | null) {
  const source = getYouTubePlaybackSource(url);
  return Boolean(source?.videoId || source?.playlistId);
}

export function buildYouTubeEmbedUrl(
  source: Pick<YouTubePlaybackSource, "videoId" | "playlistId" | "playlistIndex">,
  options?: {
    nativeControls?: boolean;
    startAt?: number;
    autoplay?: boolean;
    host?: "youtube" | "youtube-nocookie";
    enableJsApi?: boolean;
  },
) {
  if (!hasPlayableYouTubeTarget(source)) {
    return null;
  }

  const params = new URLSearchParams({
    autoplay: options?.autoplay ? "1" : "0",
    controls: options?.nativeControls === false ? "0" : "1",
    playsinline: "1",
    rel: "0",
  });

  if (options?.enableJsApi) {
    params.set("enablejsapi", "1");
    if (typeof window !== "undefined") {
      params.set("origin", window.location.origin);
    }
  }

  if (options?.startAt && options.startAt > 0) {
    params.set("start", String(Math.floor(options.startAt)));
  }

  if (source.playlistId) {
    params.set("listType", "playlist");
    params.set("list", source.playlistId);

    if (typeof source.playlistIndex === "number") {
      params.set("index", String(source.playlistIndex));
    }
  }

  const path = source.videoId ? `/embed/${source.videoId}` : "/embed";
  const host =
    options?.host === "youtube-nocookie"
      ? "https://www.youtube-nocookie.com"
      : "https://www.youtube.com";
  return `${host}${path}?${params.toString()}`;
}

export function getYouTubePlaylistProgressReport(
  url?: string | null,
  progress?: Pick<
    YouTubePlaylistProgress,
    "currentIndex" | "furthestIndex" | "totalVideos" | "videoIds" | "videosById"
  > | null,
) {
  const source = getYouTubePlaybackSource(url);

  if (!source?.playlistId) {
    return null;
  }

  const totalVideos = Math.max(progress?.totalVideos ?? 0, 0);
  const fallbackIndex = source.playlistIndex ?? 0;
  const rawCurrentIndex = progress?.currentIndex ?? fallbackIndex;
  const currentIndex =
    totalVideos > 0
      ? Math.min(Math.max(rawCurrentIndex, 0), totalVideos - 1)
      : Math.max(rawCurrentIndex, 0);
  const rawFurthestIndex = progress?.furthestIndex ?? currentIndex;
  const furthestIndex =
    totalVideos > 0
      ? Math.min(Math.max(rawFurthestIndex, currentIndex), totalVideos - 1)
      : Math.max(rawFurthestIndex, currentIndex);
  const currentVideoId = progress?.videoIds?.[currentIndex];
  const currentVideoProgress = currentVideoId ? progress?.videosById?.[currentVideoId] : null;
  const completedCountFromVideos = Object.values(progress?.videosById ?? {}).filter(
    (entry) => entry.completed,
  ).length;
  const completedCount =
    totalVideos > 0
      ? Math.min(
          Math.max(completedCountFromVideos, 0),
          totalVideos,
        )
      : completedCountFromVideos;
  const currentPosition = totalVideos > 0 ? Math.min(currentIndex + 1, totalVideos) : 0;
  const currentVideoShare =
    totalVideos > 0 &&
    currentVideoProgress &&
    !currentVideoProgress.completed &&
    currentVideoProgress.duration &&
    currentVideoProgress.duration > 0
      ? Math.min(currentVideoProgress.seconds / currentVideoProgress.duration, 1) / totalVideos
      : 0;
  const percent =
    totalVideos > 0
      ? Math.round(((completedCount / totalVideos) + currentVideoShare) * 100)
      : 0;

  return {
    playlistId: source.playlistId,
    totalVideos,
    currentIndex,
    currentPosition,
    furthestIndex,
    completedCount,
    percent,
    isComplete: totalVideos > 0 && completedCount >= totalVideos,
    summary:
      totalVideos > 0
        ? `${completedCount} of ${totalVideos} videos completed`
        : "Start playing to map out this playlist.",
    status:
      totalVideos > 0
        ? `Video ${currentPosition} of ${totalVideos}`
        : "Playlist saved",
  };
}
