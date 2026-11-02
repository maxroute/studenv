"use client";

import clsx from "clsx";
import {
  AudioLines,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gauge,
  MonitorUp,
  SkipBack,
  SkipForward,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import toast from "react-hot-toast";
import { useItems } from "@/hooks/useItems";
import { usePlaybackStore, type PlaybackProgress } from "@/hooks/usePlaybackStore";
import {
  getYouTubePlaylistProgressReport,
  type YouTubePlaylistProgress,
  type YouTubePlaylistProgressInput,
  getYouTubePlaybackSource,
  normalizeYouTubeUrl,
} from "@/lib/utils/youtube";
import type { ItemRecord } from "@/types";

type YouTubePlayer = {
  destroy: () => void;
  getAvailablePlaybackRates?: () => number[];
  pauseVideo: () => void;
  previousVideo: () => void;
  playVideo: () => void;
  playVideoAt?: (index: number) => void;
  nextVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getPlaylist?: () => string[];
  getPlaylistIndex?: () => number;
  getPlaybackRate?: () => number;
  getVolume?: () => number;
  isMuted?: () => boolean;
  mute?: () => void;
  setPlaybackRate?: (suggestedRate: number) => void;
  setVolume?: (volume: number) => void;
  unMute?: () => void;
};

type YouTubePlayerEvent = {
  target: YouTubePlayer;
  data: number;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId?: string;
      width: string | number;
      height: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: YouTubePlayerEvent) => void;
        onStateChange?: (event: YouTubePlayerEvent) => void;
        onError?: () => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    ENDED: number;
    PAUSED: number;
    PLAYING: number;
  };
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00";
  }

  const rounded = Math.floor(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getSourceLabel(item: ItemRecord | null) {
  const playbackSource = getYouTubePlaybackSource(item?.url);

  if (playbackSource?.playlistId) {
    return "YouTube Playlist";
  }

  if (playbackSource?.videoId) {
    return "YouTube";
  }

  const rawHost = item?.sourceHost?.trim() ?? "";

  if (rawHost) {
    return rawHost.includes("youtube") ? "YouTube" : rawHost.replace(/^www\./, "");
  }

  if (!item?.url) {
    return "Saved video";
  }

  try {
    const host = new URL(normalizeYouTubeUrl(item.url)).hostname.replace(/^www\./, "");
    return host.includes("youtube") ? "YouTube" : host;
  } catch {
    return "Saved video";
  }
}

function getStatusLabel(status: ItemRecord["status"]) {
  switch (status) {
    case "reading":
      return "In progress";
    case "done":
      return "Done";
    default:
      return "Unread";
  }
}

function buildEmbedUrl(
  source: {
    videoId: string | null;
    playlistId: string | null;
    playlistIndex: number | null;
  },
  options?: {
    enableJsApi?: boolean;
    nativeControls?: boolean;
    startAt?: number;
  },
) {
  const params = new URLSearchParams({
    autoplay: "1",
    controls: options?.nativeControls ? "1" : "0",
    playsinline: "1",
    rel: "0",
  });

  if (options?.enableJsApi) {
    params.set("enablejsapi", "1");
    params.set("origin", window.location.origin);
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
  return `https://www.youtube-nocookie.com${path}?${params.toString()}`;
}

function getYouTubeThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function getPlaylistProgressInput(
  player: YouTubePlayer | null,
  options?: {
    fallbackIndex?: number | null;
    existing?: YouTubePlaylistProgress | null;
    seconds?: number;
    duration?: number;
    markCompletedCurrent?: boolean;
  },
): YouTubePlaylistProgressInput | undefined {
  const playlist = player?.getPlaylist?.() ?? [];
  const videoIds = Array.isArray(playlist) ? playlist.filter(Boolean) : [];
  const totalVideos = videoIds.length;
  const rawIndex = player?.getPlaylistIndex?.();
  const nextIndex =
    typeof rawIndex === "number" && Number.isFinite(rawIndex) && rawIndex >= 0
      ? rawIndex
      : (options?.fallbackIndex ?? 0);

  if (totalVideos <= 0 && nextIndex < 0) {
    return undefined;
  }

  const currentIndex =
    totalVideos > 0
      ? Math.min(Math.max(nextIndex, 0), totalVideos - 1)
      : Math.max(nextIndex, 0);
  const currentVideoId = videoIds[currentIndex];
  const previousVideosById = options?.existing?.videosById ?? {};
  const nextVideosById = Object.entries(previousVideosById).reduce<
    NonNullable<YouTubePlaylistProgressInput["videosById"]>
  >((accumulator, [videoId, value]) => {
    accumulator[videoId] = {
      videoId,
      seconds: value.seconds,
      ...(value.duration ? { duration: value.duration } : {}),
      completed: value.completed,
    };
    return accumulator;
  }, {});

  if (currentVideoId) {
    const previousVideo = nextVideosById[currentVideoId];
    const nextDuration =
      typeof options?.duration === "number" &&
      Number.isFinite(options.duration) &&
      options.duration > 0
        ? options.duration
        : previousVideo?.duration;
    const nextSeconds = Math.max(
      typeof options?.seconds === "number" && Number.isFinite(options.seconds)
        ? options.seconds
        : 0,
      previousVideo?.seconds ?? 0,
    );

    nextVideosById[currentVideoId] = {
      videoId: currentVideoId,
      seconds: nextSeconds,
      ...(nextDuration ? { duration: nextDuration } : {}),
      completed:
        Boolean(options?.markCompletedCurrent) ||
        Boolean(previousVideo?.completed) ||
        (typeof nextDuration === "number" && nextSeconds >= nextDuration - 1),
    };
  }

  return {
    currentIndex,
    furthestIndex: Math.max(currentIndex, options?.existing?.furthestIndex ?? -1),
    totalVideos,
    videoIds,
    videosById: nextVideosById,
  };
}

function loadYouTubeApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The video player is only available in the browser."));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    const scriptSelector = 'script[src="https://www.youtube.com/iframe_api"]';
    const existingScript = document.querySelector<HTMLScriptElement>(scriptSelector);

    const cleanup = () => {
      window.onYouTubeIframeAPIReady = previousCallback;
    };

    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();

      if (window.YT?.Player) {
        cleanup();
        resolve(window.YT);
        return;
      }

      youtubeApiPromise = null;
      cleanup();
      reject(new Error("The YouTube player did not finish loading."));
    };

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        youtubeApiPromise = null;
        cleanup();
        reject(new Error("The YouTube player script failed to load."));
      };
      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

export function VideoPlayerOverlay() {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const playbackRateMenuRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const videoControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  const itemRef = useRef<ItemRecord | null>(null);
  const readingSyncRef = useRef<string | null>(null);
  const latestProgressRef = useRef<PlaybackProgress | null>(null);
  const pendingResumeTimeRef = useRef(0);
  const playbackApiRef = useRef<{
    updateItem: (id: string, payload: Record<string, unknown>) => Promise<ItemRecord[] | undefined>;
    setPlaying: (value: boolean) => void;
    setProgress: (
      itemId: string,
      progress: {
        seconds: number;
        duration?: number;
        playlist?: YouTubePlaylistProgressInput;
      },
    ) => void;
    clearProgress: (itemId: string) => void;
  } | null>(null);

  const activeItemId = usePlaybackStore((state) => state.activeItemId);
  const isExpanded = usePlaybackStore((state) => state.isExpanded);
  const isPlaying = usePlaybackStore((state) => state.isPlaying);
  const progressByItemId = usePlaybackStore((state) => state.progressByItemId);
  const expandPlayer = usePlaybackStore((state) => state.expandPlayer);
  const minimizePlayer = usePlaybackStore((state) => state.minimizePlayer);
  const closePlayer = usePlaybackStore((state) => state.closePlayer);
  const setPlaying = usePlaybackStore((state) => state.setPlaying);
  const setProgress = usePlaybackStore((state) => state.setProgress);
  const clearProgress = usePlaybackStore((state) => state.clearProgress);
  const { items, isLoading, mutate, updateItem } = useItems({});

  const [playerError, setPlayerError] = useState<string | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [iframeStartAt, setIframeStartAt] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRateValue] = useState(1);
  const [availablePlaybackRates, setAvailablePlaybackRates] = useState<number[]>([1]);
  const [isPlaybackRateOpen, setIsPlaybackRateOpen] = useState(false);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const [areVideoControlsVisible, setAreVideoControlsVisible] = useState(true);

  const item = useMemo(
    () => items.find((entry) => entry.id === activeItemId) ?? null,
    [activeItemId, items],
  );
  const playbackSource = useMemo(() => getYouTubePlaybackSource(item?.url), [item?.url]);
  const videoId = playbackSource?.videoId ?? null;
  const hasPlaylist = Boolean(playbackSource?.playlistId);
  const savedProgress = activeItemId ? progressByItemId[activeItemId] : undefined;
  const savedPlaylistProgress = savedProgress?.playlist;
  const playlistReport = useMemo(
    () => getYouTubePlaylistProgressReport(item?.url, savedPlaylistProgress),
    [item?.url, savedPlaylistProgress],
  );
  const savedResumeTime =
    savedProgress?.duration && savedProgress.duration - (savedProgress.seconds ?? 0) < 3
      ? 0
      : savedProgress?.seconds ?? 0;
  const progressPercent = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const sourceLabel = getSourceLabel(item);
  const statusLabel = item ? getStatusLabel(item.status) : "Unread";
  const hasSavedProgress = savedResumeTime > 3;
  const effectiveVolumeLevel = isMuted ? 0 : Math.round(volumeLevel);
  const progressLabel =
    duration > 0
      ? `${formatDuration(currentTime)} / ${formatDuration(duration)}`
      : formatDuration(currentTime);
  const resumeLabel = playlistReport?.totalVideos
    ? playlistReport.status
    : hasPlaylist
      ? "Playlist ready"
      : hasSavedProgress
        ? `Resume from ${formatDuration(savedResumeTime)}`
        : "Fresh start";
  const playerStateLabel = hasCompleted
    ? "Completed"
    : isPlaying
      ? "Playing"
      : hasSavedProgress
        ? "Paused"
        : "Ready";
  const canUseAppControls = !useIframeFallback && isPlayerReady;
  const playbackRateOptions = useMemo(
    () =>
      [...new Set([...availablePlaybackRates, playbackRate])]
        .filter((rate) => Number.isFinite(rate) && rate > 0)
        .sort((first, second) => first - second),
    [availablePlaybackRates, playbackRate],
  );
  const openSourceLabel = hasPlaylist
    ? "Open playlist"
    : sourceLabel === "YouTube"
      ? "Open on YouTube"
      : "Open source";
  const progressTrackStyle = canUseAppControls
    ? ({
        ["--range-fill-percent" as string]: `${progressPercent}%`,
      } as CSSProperties)
    : undefined;
  const volumeTrackStyle = canUseAppControls
    ? ({
        ["--range-fill-percent" as string]: `${effectiveVolumeLevel}%`,
      } as CSSProperties)
    : undefined;
  const isStageOverlayVisible = !canUseAppControls || areVideoControlsVisible;
  const insightCopy = item?.notes?.trim() || item?.excerpt?.trim() || "";
  const playlistVideoRows = useMemo(() => {
    const playlist = savedPlaylistProgress;

    if (!playlist?.videoIds?.length) {
      return [];
    }

    return playlist.videoIds.map((videoId, index) => {
      const storedVideo = playlist.videosById?.[videoId];
      const isCurrent = index === (playlistReport?.currentIndex ?? playlist.currentIndex);
      const effectiveSeconds = isCurrent ? currentTime : (storedVideo?.seconds ?? 0);
      const effectiveDuration =
        isCurrent && duration > 0 ? duration : (storedVideo?.duration ?? 0);
      const isCompleted = Boolean(
        storedVideo?.completed ||
          (effectiveDuration > 0 && effectiveSeconds >= effectiveDuration - 1),
      );
      const percent = isCompleted
        ? 100
        : effectiveDuration > 0
          ? Math.round((Math.min(effectiveSeconds, effectiveDuration) / effectiveDuration) * 100)
          : 0;

      return {
        videoId,
        index,
        label: `Video ${index + 1}`,
        idLabel: `${videoId.slice(0, 4)}...${videoId.slice(-3)}`,
        isCurrent,
        isCompleted,
        percent,
        progressLabel:
          effectiveDuration > 0
            ? `${formatDuration(effectiveSeconds)} / ${formatDuration(effectiveDuration)}`
            : effectiveSeconds > 0
              ? formatDuration(effectiveSeconds)
              : "Not started",
      };
    });
  }, [currentTime, duration, playlistReport?.currentIndex, savedPlaylistProgress]);

  useEffect(() => {
    itemRef.current = item;
  }, [item]);

  useEffect(() => {
    readingSyncRef.current = null;
  }, [item?.id]);

  useEffect(() => {
    latestProgressRef.current = savedProgress ?? null;
  }, [savedProgress]);

  useEffect(() => {
    pendingResumeTimeRef.current = savedResumeTime;
  }, [savedResumeTime]);

  useEffect(() => {
    playbackApiRef.current = {
      updateItem,
      setPlaying,
      setProgress,
      clearProgress,
    };
  }, [clearProgress, setPlaying, setProgress, updateItem]);

  useEffect(() => {
    if (!activeItemId || !isExpanded) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isPlaybackRateOpen) {
          setIsPlaybackRateOpen(false);
          return;
        }

        minimizePlayer();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeItemId, isExpanded, isPlaybackRateOpen, minimizePlayer]);

  useEffect(() => {
    if (!isPlaybackRateOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (!playbackRateMenuRef.current?.contains(event.target as Node)) {
        setIsPlaybackRateOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPlaybackRateOpen]);

  useEffect(() => {
    if (activeItemId && !isLoading && !item) {
      closePlayer();
    }
  }, [activeItemId, closePlayer, isLoading, item]);

  useEffect(() => {
    setAreVideoControlsVisible(true);
    completedRef.current = false;
    setHasCompleted(false);
    setPlayerError(null);
    setUseIframeFallback(false);
    setIsPlayerReady(false);
    setCurrentTime(pendingResumeTimeRef.current);
    setDuration(latestProgressRef.current?.duration ?? 0);
    setIframeStartAt(pendingResumeTimeRef.current);
    setVolumeLevel(100);
    setIsMuted(false);
    setPlaybackRateValue(1);
    setAvailablePlaybackRates([1]);
    setIsPlaybackRateOpen(false);
  }, [item?.id]);

  useEffect(() => {
    if (!canUseAppControls) {
      setIsPlaybackRateOpen(false);
    }
  }, [canUseAppControls]);

  useEffect(() => {
    if (!isExpanded) {
      setIsPlaybackRateOpen(false);
    }
  }, [isExpanded]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsStageFullscreen(document.fullscreenElement === stageFrameRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    clearVideoControlsTimeout();
    setAreVideoControlsVisible(true);

    if (isExpanded && canUseAppControls && isPlaying && !isPlaybackRateOpen) {
      videoControlsTimeoutRef.current = setTimeout(() => {
        setAreVideoControlsVisible(false);
        videoControlsTimeoutRef.current = null;
      }, 1800);
    }

    return () => {
      clearVideoControlsTimeout();
    };
  }, [item?.id, isExpanded, canUseAppControls, isPlaying, isPlaybackRateOpen]);

  useEffect(() => {
    if (
      !item?.id ||
      !playbackSource ||
      (!playbackSource.videoId && !playbackSource.playlistId) ||
      !mountRef.current
    ) {
      return;
    }

    let cancelled = false;

    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mountRef.current) {
          return;
        }

        const startAt = pendingResumeTimeRef.current > 3 ? pendingResumeTimeRef.current : 0;

        playerRef.current?.destroy();
        setPlayerError(null);
        setUseIframeFallback(false);
        setIsPlayerReady(false);

        playerRef.current = new YT.Player(mountRef.current, {
          ...(playbackSource.videoId ? { videoId: playbackSource.videoId } : {}),
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            controls: 0,
            iv_load_policy: 3,
            playsinline: 1,
            rel: 0,
            ...(playbackSource.playlistId
              ? {
                  listType: "playlist",
                  list: playbackSource.playlistId,
                  ...(typeof playbackSource.playlistIndex === "number"
                    ? { index: playbackSource.playlistIndex }
                    : {}),
                }
              : {}),
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (startAt > 0) {
                event.target.seekTo(startAt, true);
              }

              const nextDuration = event.target.getDuration?.() ?? 0;
              const nextPlaylistProgress = getPlaylistProgressInput(event.target, {
                fallbackIndex:
                  playbackSource?.playlistIndex ?? savedPlaylistProgress?.currentIndex ?? null,
                existing: latestProgressRef.current?.playlist ?? savedPlaylistProgress ?? null,
                seconds: startAt,
                duration: nextDuration > 0 ? nextDuration : undefined,
              });

              if (nextDuration > 0) {
                setDuration(nextDuration);
              }

              const nextVolume = event.target.getVolume?.();
              if (typeof nextVolume === "number") {
                setVolumeLevel(nextVolume);
              }

              setIsMuted(Boolean(event.target.isMuted?.()));

              const nextPlaybackRate = event.target.getPlaybackRate?.();
              if (typeof nextPlaybackRate === "number") {
                setPlaybackRateValue(nextPlaybackRate);
              }

              const nextPlaybackRates = event.target.getAvailablePlaybackRates?.() ?? [];
              setAvailablePlaybackRates(nextPlaybackRates.length ? nextPlaybackRates : [1]);

              if (itemRef.current && nextPlaylistProgress) {
                playbackApiRef.current?.setProgress(itemRef.current.id, {
                  seconds: startAt,
                  duration: nextDuration > 0 ? nextDuration : undefined,
                  playlist: nextPlaylistProgress,
                });
              }

              setIsPlayerReady(true);
              playbackApiRef.current?.setPlaying(true);
              event.target.playVideo();
            },
            onStateChange: (event) => {
              const nextTime = event.target.getCurrentTime?.() ?? 0;
              const nextDuration = event.target.getDuration?.() ?? 0;
              const nextPlaylistProgress = getPlaylistProgressInput(event.target, {
                fallbackIndex:
                  playbackSource?.playlistIndex ?? savedPlaylistProgress?.currentIndex ?? null,
                existing: latestProgressRef.current?.playlist ?? savedPlaylistProgress ?? null,
                seconds: nextTime,
                duration: nextDuration > 0 ? nextDuration : undefined,
              });

              if (nextTime >= 0) {
                setCurrentTime(nextTime);
              }

              if (nextDuration > 0) {
                setDuration(nextDuration);
              }

              if (itemRef.current && nextPlaylistProgress) {
                playbackApiRef.current?.setProgress(itemRef.current.id, {
                  seconds: nextTime,
                  duration: nextDuration > 0 ? nextDuration : undefined,
                  playlist: nextPlaylistProgress,
                });
              }

              if (event.data === YT.PlayerState.PLAYING) {
                completedRef.current = false;
                setHasCompleted(false);
                playbackApiRef.current?.setPlaying(true);
                syncReadingStatus();
              }

              if (event.data === YT.PlayerState.PAUSED) {
                playbackApiRef.current?.setPlaying(false);
              }

              if (event.data === YT.PlayerState.ENDED && !completedRef.current) {
                if (playbackSource?.playlistId) {
                  const currentItem = itemRef.current;

                  playbackApiRef.current?.setPlaying(false);

                  if (!currentItem) {
                    return;
                  }

                  const completedPlaylistProgress = getPlaylistProgressInput(event.target, {
                    fallbackIndex:
                      playbackSource?.playlistIndex ?? savedPlaylistProgress?.currentIndex ?? null,
                    existing: latestProgressRef.current?.playlist ?? savedPlaylistProgress ?? null,
                    seconds: nextDuration || nextTime,
                    duration: nextDuration > 0 ? nextDuration : undefined,
                    markCompletedCurrent: true,
                  });
                  const isFinalPlaylistVideo = Boolean(
                    completedPlaylistProgress &&
                      completedPlaylistProgress.totalVideos > 0 &&
                      completedPlaylistProgress.currentIndex >=
                        completedPlaylistProgress.totalVideos - 1,
                  );

                  playbackApiRef.current?.setProgress(currentItem.id, {
                    seconds: nextDuration || nextTime,
                    duration: nextDuration > 0 ? nextDuration : undefined,
                    ...(completedPlaylistProgress
                      ? { playlist: completedPlaylistProgress }
                      : {}),
                  });

                  if (!isFinalPlaylistVideo) {
                    return;
                  }

                  completedRef.current = true;
                  setHasCompleted(true);
                  setCurrentTime(nextDuration || nextTime);

                  if (currentItem.status === "done") {
                    toast.success("Playlist completed.");
                    return;
                  }

                  void playbackApiRef.current
                    ?.updateItem(currentItem.id, {
                      status: "done",
                      type: currentItem.type,
                      ...(currentItem.url ? { url: currentItem.url } : {}),
                    })
                    .then(() => {
                      toast.success("Playlist completed. Marked as done.");
                    })
                    .catch((error) => {
                      setPlayerError(
                        "The playlist finished, but we could not update its status automatically.",
                      );
                      toast.error((error as Error).message);
                    });
                  return;
                }

                completedRef.current = true;
                setHasCompleted(true);
                setCurrentTime(nextDuration || nextTime);
                playbackApiRef.current?.setPlaying(false);

                const currentItem = itemRef.current;
                if (!currentItem) {
                  return;
                }

                playbackApiRef.current?.clearProgress(currentItem.id);

                if (currentItem.status === "done") {
                  toast.success("Video completed.");
                  return;
                }

                void playbackApiRef.current
                  ?.updateItem(currentItem.id, {
                    status: "done",
                    type: currentItem.type,
                    ...(currentItem.url ? { url: currentItem.url } : {}),
                  })
                  .then(() => {
                    toast.success("Video completed. Marked as done.");
                  })
                  .catch((error) => {
                    setPlayerError(
                      "The video finished, but we could not update its status automatically.",
                    );
                    toast.error((error as Error).message);
                  });
              }
            },
            onError: () => {
              const nextTime = playerRef.current?.getCurrentTime?.() ?? pendingResumeTimeRef.current;
              const nextDuration =
                playerRef.current?.getDuration?.() ?? latestProgressRef.current?.duration ?? 0;
              const nextPlaylistProgress = getPlaylistProgressInput(playerRef.current, {
                fallbackIndex:
                  playbackSource?.playlistIndex ??
                  latestProgressRef.current?.playlist?.currentIndex ??
                  null,
                existing: latestProgressRef.current?.playlist ?? savedPlaylistProgress ?? null,
                seconds: nextTime,
                duration: nextDuration > 0 ? nextDuration : undefined,
              });

              if (itemRef.current && !completedRef.current) {
                playbackApiRef.current?.setProgress(itemRef.current.id, {
                  seconds: nextTime,
                  duration: nextDuration > 0 ? nextDuration : undefined,
                  ...(nextPlaylistProgress ? { playlist: nextPlaylistProgress } : {}),
                });
              }

              setIframeStartAt(nextTime);
              setCurrentTime(nextTime);
              if (nextDuration > 0) {
                setDuration(nextDuration);
              }

              playerRef.current?.destroy();
              playerRef.current = null;
              playbackApiRef.current?.setPlaying(false);
              setIsPlayerReady(false);
              setUseIframeFallback(true);
              setPlayerError(
                "Interactive controls were limited here, so the player switched to the embedded fallback view.",
              );
            },
          },
        });
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error);
          playbackApiRef.current?.setPlaying(false);
          setIsPlayerReady(false);
          setUseIframeFallback(true);
          setPlayerError(
            "The YouTube API was blocked, so the video is using the embedded fallback player.",
          );
        }
      });

    return () => {
      cancelled = true;

      const player = playerRef.current;
      const currentItem = itemRef.current;
      const nextTime = player?.getCurrentTime?.() ?? 0;
      const nextDuration = player?.getDuration?.() ?? latestProgressRef.current?.duration ?? 0;
      const nextPlaylistProgress = getPlaylistProgressInput(player, {
        fallbackIndex:
          playbackSource?.playlistIndex ??
          latestProgressRef.current?.playlist?.currentIndex ??
          null,
        existing: latestProgressRef.current?.playlist ?? savedPlaylistProgress ?? null,
        seconds: nextTime,
        duration: nextDuration > 0 ? nextDuration : undefined,
      });

      if (player && currentItem && !completedRef.current) {
        playbackApiRef.current?.setProgress(currentItem.id, {
          seconds: nextTime,
          duration: nextDuration > 0 ? nextDuration : undefined,
          ...(nextPlaylistProgress ? { playlist: nextPlaylistProgress } : {}),
        });
      }

      player?.destroy();
      playerRef.current = null;
      setIsPlayerReady(false);
      playbackApiRef.current?.setPlaying(false);
    };
  }, [item?.id, playbackSource]);

  useEffect(() => {
    if (!item?.id || useIframeFallback || !isPlayerReady) {
      return;
    }

    const itemId = item.id;

    function commitProgress() {
      const player = playerRef.current;

      if (!player || completedRef.current) {
        return;
      }

      const nextTime = player.getCurrentTime?.() ?? 0;
      const nextDuration = player.getDuration?.() ?? 0;
      const nextVolume = player.getVolume?.();
      const nextPlaybackRate = player.getPlaybackRate?.();
      const nextPlaybackRates = player.getAvailablePlaybackRates?.() ?? [];
      const nextPlaylistProgress = getPlaylistProgressInput(player, {
        fallbackIndex:
          playbackSource?.playlistIndex ?? savedPlaylistProgress?.currentIndex ?? null,
        existing: latestProgressRef.current?.playlist ?? savedPlaylistProgress ?? null,
        seconds: nextTime,
        duration: nextDuration > 0 ? nextDuration : undefined,
      });

      if (nextTime >= 0) {
        setCurrentTime(nextTime);
      }

      if (nextDuration > 0) {
        setDuration(nextDuration);
      }

      if (typeof nextVolume === "number") {
        setVolumeLevel(nextVolume);
      }

      setIsMuted(Boolean(player.isMuted?.()));

      if (typeof nextPlaybackRate === "number") {
        setPlaybackRateValue(nextPlaybackRate);
      }

      if (nextPlaybackRates.length) {
        setAvailablePlaybackRates(nextPlaybackRates);
      }

      setProgress(itemId, {
        seconds: nextTime,
        duration: nextDuration > 0 ? nextDuration : undefined,
        ...(nextPlaylistProgress ? { playlist: nextPlaylistProgress } : {}),
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        commitProgress();
      }
    }

    const intervalId = window.setInterval(commitProgress, 1000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", commitProgress);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", commitProgress);
    };
  }, [
    isPlayerReady,
    item?.id,
    playbackSource?.playlistIndex,
    savedPlaylistProgress?.currentIndex,
    setProgress,
    useIframeFallback,
  ]);

  function handleTogglePlayback() {
    if (!playerRef.current || !isPlayerReady || useIframeFallback) {
      return;
    }

    if (isPlaying) {
      playerRef.current.pauseVideo();
      setPlaying(false);
      return;
    }

    playerRef.current.playVideo();
    setPlaying(true);
  }

  function handleOpenSource() {
    if (!item?.url) {
      return;
    }

    window.open(normalizeYouTubeUrl(item.url), "_blank", "noopener,noreferrer");
  }

  function syncPlaylistStepProgress(options?: { markCompletedCurrent?: boolean }) {
    if (!item?.id || !playerRef.current) {
      return;
    }

    const nextTime = playerRef.current.getCurrentTime?.() ?? currentTime;
    const nextDuration = playerRef.current.getDuration?.() ?? duration;
    const nextPlaylistProgress = getPlaylistProgressInput(playerRef.current, {
      fallbackIndex: playbackSource?.playlistIndex ?? savedPlaylistProgress?.currentIndex ?? null,
      existing: latestProgressRef.current?.playlist ?? savedPlaylistProgress ?? null,
      seconds: nextTime,
      duration: nextDuration > 0 ? nextDuration : undefined,
      markCompletedCurrent: options?.markCompletedCurrent,
    });

    setProgress(item.id, {
      seconds: nextTime,
      duration: nextDuration > 0 ? nextDuration : undefined,
      ...(nextPlaylistProgress ? { playlist: nextPlaylistProgress } : {}),
    });
  }

  function handlePlaylistNavigation(direction: "next" | "previous") {
    if (!playerRef.current || !isPlayerReady || useIframeFallback || !hasPlaylist) {
      return;
    }

    syncPlaylistStepProgress();
    completedRef.current = false;
    setHasCompleted(false);

    if (direction === "next") {
      playerRef.current.nextVideo();
    } else {
      playerRef.current.previousVideo();
    }

    setPlaying(true);
  }

  function handlePlaylistVideoSelect(index: number) {
    if (
      !playerRef.current ||
      !playerRef.current.playVideoAt ||
      !isPlayerReady ||
      useIframeFallback ||
      !hasPlaylist
    ) {
      return;
    }

    syncPlaylistStepProgress();
    completedRef.current = false;
    setHasCompleted(false);
    playerRef.current.playVideoAt(index);
    setPlaying(true);
  }

  function handleSeek(nextSeconds: number) {
    if (!playerRef.current || !isPlayerReady || useIframeFallback) {
      return;
    }

    const boundedSeconds =
      duration > 0 ? Math.min(Math.max(nextSeconds, 0), duration) : Math.max(nextSeconds, 0);

    completedRef.current = false;
    setHasCompleted(false);
    playerRef.current.seekTo(boundedSeconds, true);
    setCurrentTime(boundedSeconds);

    if (item?.id) {
      const nextPlaylistProgress = getPlaylistProgressInput(playerRef.current, {
        fallbackIndex:
          playbackSource?.playlistIndex ?? savedPlaylistProgress?.currentIndex ?? null,
        existing: latestProgressRef.current?.playlist ?? savedPlaylistProgress ?? null,
        seconds: boundedSeconds,
        duration: duration > 0 ? duration : undefined,
      });
      setProgress(item.id, {
        seconds: boundedSeconds,
        duration: duration > 0 ? duration : undefined,
        ...(nextPlaylistProgress ? { playlist: nextPlaylistProgress } : {}),
      });
    }
  }

  function handleToggleMute() {
    if (!playerRef.current || !isPlayerReady || useIframeFallback) {
      return;
    }

    if (isMuted) {
      playerRef.current.unMute?.();
      setIsMuted(false);
      return;
    }

    playerRef.current.mute?.();
    setIsMuted(true);
  }

  function handleVolumeChange(nextVolume: number) {
    if (!playerRef.current || !isPlayerReady || useIframeFallback) {
      return;
    }

    const boundedVolume = Math.min(Math.max(nextVolume, 0), 100);
    playerRef.current.setVolume?.(boundedVolume);

    if (boundedVolume === 0) {
      playerRef.current.mute?.();
      setIsMuted(true);
    } else {
      playerRef.current.unMute?.();
      setIsMuted(false);
    }

    setVolumeLevel(boundedVolume);
  }

  function handlePlaybackRateChange(nextRate: number) {
    if (!playerRef.current || !isPlayerReady || useIframeFallback) {
      return;
    }

    playerRef.current.setPlaybackRate?.(nextRate);
    setPlaybackRateValue(nextRate);
    setIsPlaybackRateOpen(false);
  }

  function clearVideoControlsTimeout() {
    if (videoControlsTimeoutRef.current !== null) {
      clearTimeout(videoControlsTimeoutRef.current);
      videoControlsTimeoutRef.current = null;
    }
  }

  function scheduleVideoControlsHide(delay = 1800) {
    clearVideoControlsTimeout();

    if (!isExpanded || !canUseAppControls || !isPlaying || isPlaybackRateOpen) {
      setAreVideoControlsVisible(true);
      return;
    }

    videoControlsTimeoutRef.current = setTimeout(() => {
      setAreVideoControlsVisible(false);
      videoControlsTimeoutRef.current = null;
    }, delay);
  }

  function revealVideoControls(delay = 1800) {
    setAreVideoControlsVisible(true);
    scheduleVideoControlsHide(delay);
  }

  function handleStagePointerActivity() {
    revealVideoControls();
  }

  function handleStagePointerLeave() {
    scheduleVideoControlsHide(600);
  }

  function handleStageOverlayFocus() {
    revealVideoControls(2200);
  }

  function handleStageOverlayBlur() {
    scheduleVideoControlsHide(900);
  }

  function handleStageSurfaceClick() {
    if (isPlaybackRateOpen) {
      setIsPlaybackRateOpen(false);
      revealVideoControls();
      return;
    }

    revealVideoControls();

    if (canUseAppControls) {
      handleTogglePlayback();
    }
  }

  async function handleStageFullscreen() {
    const frame = stageFrameRef.current;

    if (!frame) {
      return;
    }

    if (document.fullscreenElement === frame) {
      await document.exitFullscreen();
      return;
    }

    await frame.requestFullscreen();
  }

  function syncReadingStatus() {
    const currentItem = itemRef.current;

    if (!currentItem || currentItem.status !== "unread" || completedRef.current) {
      return;
    }

    if (readingSyncRef.current === currentItem.id) {
      return;
    }

    readingSyncRef.current = currentItem.id;
    itemRef.current = {
      ...currentItem,
      status: "reading",
    };

    void mutate(
      (current) =>
        current?.map((entry) =>
          entry.id === currentItem.id ? { ...entry, status: "reading" } : entry,
        ) ?? [],
      { revalidate: false },
    );

    void playbackApiRef.current
      ?.updateItem(currentItem.id, {
        status: "reading",
        type: currentItem.type,
        ...(currentItem.url ? { url: currentItem.url } : {}),
      })
      .then((result) => {
        const updatedItem = Array.isArray(result) ? result.find((i) => i.id === currentItem.id) : undefined;
        if (!updatedItem) {
          itemRef.current = currentItem;
          readingSyncRef.current = null;
          return;
        }
        itemRef.current = updatedItem;
        readingSyncRef.current = null;
        void mutate(
          (current) =>
            current?.map((entry) => (entry.id === updatedItem.id ? updatedItem : entry)) ?? [
              updatedItem,
            ],
          { revalidate: false },
        );
      })
      .catch(() => {
        itemRef.current = currentItem;
        readingSyncRef.current = null;
        void mutate(
          (current) =>
            current?.map((entry) => (entry.id === currentItem.id ? currentItem : entry)) ?? [],
          { revalidate: false },
        );
      });
  }

  if (!activeItemId || !item) {
    return null;
  }

  return (
    <div className={clsx("playback-shell", isExpanded ? "expanded" : "minimized")}>
      <button
        aria-label="Minimize video player"
        className={clsx("playback-backdrop", isExpanded && "visible")}
        onClick={minimizePlayer}
        type="button"
      />

      <section className={clsx("playback-card", isExpanded ? "expanded" : "minimized")}>
        <div className="playback-stage-column">
          <div className="playback-stage-meta">
            <div className="playback-pill accent">
              <AudioLines size={14} />
              Focus Playback
            </div>
            <div className="playback-pill">
              <Clock3 size={14} />
              {resumeLabel}
            </div>
            <div className="playback-pill">{playerStateLabel}</div>
          </div>

          <div
            className="playback-stage-frame"
            onMouseLeave={handleStagePointerLeave}
            ref={stageFrameRef}
          >
            {playbackSource ? (
              useIframeFallback ? (
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="playback-iframe"
                  referrerPolicy="strict-origin-when-cross-origin"
                  src={buildEmbedUrl(playbackSource, {
                    nativeControls: true,
                    startAt: iframeStartAt,
                  })}
                  title={item.title}
                />
              ) : (
                <div className="playback-mount" ref={mountRef} />
              )
            ) : (
              <div className="playback-empty-state">
                <h3>This link cannot play inside the app yet.</h3>
                <p>
                  Save a supported YouTube video or playlist URL to get in-app playback,
                  resume tracking, and background listening.
                </p>
                {item.url ? (
                  <button className="playback-action" onClick={handleOpenSource} type="button">
                    <ExternalLink size={16} />
                    {openSourceLabel}
                  </button>
                ) : null}
              </div>
            )}

            {isExpanded && canUseAppControls ? (
              <div
                aria-hidden="true"
                className="playback-stage-hitbox"
                onClick={handleStageSurfaceClick}
                onMouseEnter={handleStagePointerActivity}
                onMouseMove={handleStagePointerActivity}
                onTouchStart={() => revealVideoControls(2200)}
              />
            ) : null}

            {playbackSource ? (
              <div
                className={clsx("playback-stage-overlay", isStageOverlayVisible && "visible")}
                onBlurCapture={handleStageOverlayBlur}
                onFocusCapture={handleStageOverlayFocus}
                onMouseMove={handleStagePointerActivity}
                onTouchStart={() => revealVideoControls(2200)}
              >
                <div className="playback-video-progress">
                  <div className="playback-video-progress-meta">
                    <span>{formatDuration(currentTime)}</span>
                    <span>{duration > 0 ? formatDuration(duration) : "--:--"}</span>
                  </div>

                  {canUseAppControls ? (
                    <input
                      aria-label="Playback progress"
                      className="playback-progress-range playback-progress-range-video"
                      max={Math.max(duration, 1)}
                      min={0}
                      onChange={(event) => handleSeek(Number(event.target.value))}
                      step={1}
                      style={progressTrackStyle}
                      type="range"
                      value={Math.min(currentTime, Math.max(duration, 1))}
                    />
                  ) : (
                    <div className="playback-progress-bar playback-progress-bar-video">
                      <div className="playback-progress-fill" style={{ width: `${progressPercent}%` }} />
                    </div>
                  )}
                </div>

                <div className="playback-video-controls">
                  <div className="playback-video-controls-left">
                    {canUseAppControls ? (
                      <>
                        <button
                          aria-label={isPlaying ? "Pause video" : "Play video"}
                          className="playback-video-control playback-video-control-primary"
                          onClick={handleTogglePlayback}
                          title={isPlaying ? "Pause" : "Play"}
                          type="button"
                        >
                          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                        </button>

                        {hasPlaylist ? (
                          <>
                            <button
                              aria-label="Previous video"
                              className="playback-video-control"
                              onClick={() => handlePlaylistNavigation("previous")}
                              title="Previous"
                              type="button"
                            >
                              <SkipBack size={18} />
                            </button>
                            <button
                              aria-label="Next video"
                              className="playback-video-control"
                              disabled={!isPlayerReady}
                              onClick={() => handlePlaylistNavigation("next")}
                              title="Next"
                              type="button"
                            >
                              <SkipForward size={18} />
                            </button>
                          </>
                        ) : null}
                      </>
                    ) : null}

                    <div className="playback-video-time">{progressLabel}</div>
                  </div>

                  <div className="playback-video-controls-right">
                    {canUseAppControls ? (
                      <div className="playback-video-volume">
                        <button
                          aria-label={effectiveVolumeLevel === 0 ? "Unmute" : "Mute"}
                          className="playback-video-control playback-video-volume-button"
                          onClick={handleToggleMute}
                          title={effectiveVolumeLevel === 0 ? "Unmute" : "Mute"}
                          type="button"
                        >
                          {effectiveVolumeLevel === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>
                        <input
                          aria-label="Volume"
                          className="playback-volume-range playback-volume-range-video"
                          max={100}
                          min={0}
                          onChange={(event) => handleVolumeChange(Number(event.target.value))}
                          step={1}
                          style={volumeTrackStyle}
                          type="range"
                          value={effectiveVolumeLevel}
                        />
                      </div>
                    ) : null}

                    {canUseAppControls ? (
                      <div className="playback-video-menu" ref={playbackRateMenuRef}>
                        <button
                          aria-label={`Playback speed ${playbackRate}x`}
                          aria-controls="playback-rate-menu"
                          aria-expanded={isPlaybackRateOpen}
                          aria-haspopup="menu"
                          className={clsx(
                            "playback-video-control",
                            isPlaybackRateOpen && "open",
                          )}
                          onClick={() => setIsPlaybackRateOpen((value) => !value)}
                          title={`Speed ${playbackRate}x`}
                          type="button"
                        >
                          <Gauge size={18} />
                        </button>

                        <div
                          aria-label="Playback speed options"
                          className={clsx("playback-rate-menu", "video", isPlaybackRateOpen && "open")}
                          id="playback-rate-menu"
                          role="menu"
                        >
                          {playbackRateOptions.map((rate) => {
                            const isSelected = playbackRate === rate;

                            return (
                              <button
                                aria-checked={isSelected}
                                className={clsx(
                                  "playback-rate-option",
                                  isSelected && "active",
                                )}
                                key={rate}
                                onClick={() => handlePlaybackRateChange(rate)}
                                role="menuitemradio"
                                type="button"
                              >
                                {rate}x
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <button
                      aria-label="Keep playing in background"
                      className="playback-video-control"
                      onClick={minimizePlayer}
                      title="Background playback"
                      type="button"
                    >
                      <Minimize2 size={18} />
                    </button>

                    <button
                      aria-label={isStageFullscreen ? "Exit full screen" : "Full screen"}
                      className="playback-video-control"
                      onClick={() => void handleStageFullscreen()}
                      title={isStageFullscreen ? "Exit full screen" : "Full screen"}
                      type="button"
                    >
                      <MonitorUp size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

          </div>

          <div className="playback-mini-bar">
            <div className="playback-mini-copy">
              <div className="playback-mini-title">{item.title}</div>
              <div className="playback-mini-meta">
                {progressLabel} · {sourceLabel}
              </div>
            </div>

            <div className="playback-mini-actions">
              {!useIframeFallback ? (
                <button
                  aria-label={isPlaying ? "Pause video" : "Play video"}
                  className="playback-icon-button"
                  disabled={!isPlayerReady}
                  onClick={handleTogglePlayback}
                  type="button"
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>
              ) : null}
              <button
                aria-label="Expand player"
                className="playback-icon-button"
                onClick={expandPlayer}
                type="button"
              >
                <Maximize2 size={16} />
              </button>
              <button
                aria-label="Close player"
                className="playback-icon-button"
                onClick={closePlayer}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        <aside className="playback-side-panel">
          <div className="playback-side-top">
            <div className="playback-copy">
              <div className="playback-kicker">Playback workspace</div>
              <h2 className="playback-title">{item.title}</h2>
            </div>

            <div className="playback-window-actions">
              {item.url ? (
                <button
                  aria-label={openSourceLabel}
                  className="playback-icon-button"
                  onClick={handleOpenSource}
                  type="button"
                >
                  <ExternalLink size={16} />
                </button>
              ) : null}
              <button
                aria-label="Keep playing in background"
                className="playback-icon-button"
                onClick={minimizePlayer}
                type="button"
              >
                <Minimize2 size={16} />
              </button>
              <button
                aria-label="Close player"
                className="playback-icon-button"
                onClick={closePlayer}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="playback-chip-row">
            <div className="playback-chip">{sourceLabel}</div>
            <div className={clsx("playback-chip", "status", item.status)}>{statusLabel}</div>
            {hasPlaylist ? (
              <div className="playback-chip">{playlistReport?.totalVideos ? `${playlistReport.totalVideos} videos` : "Playlist"}</div>
            ) : null}
            {playlistReport?.totalVideos ? (
              <div className="playback-chip">{playlistReport.percent}% complete</div>
            ) : null}
            {hasCompleted ? (
              <div className="playback-chip success">
                <CheckCircle2 size={14} />
                Marked done
              </div>
            ) : null}
          </div>

          {playlistReport ? (
            <div className="playback-playlist-card">
              <div className="playback-panel-head">
                <span>Playlist Report</span>
                <strong>
                  {playlistReport.totalVideos ? `${playlistReport.percent}%` : "Saved"}
                </strong>
              </div>

              <div className="playback-progress-bar">
                <div
                  className="playback-progress-fill"
                  style={{ width: `${playlistReport.totalVideos ? playlistReport.percent : 0}%` }}
                />
              </div>

              <div className="playback-playlist-stats">
                <div className="playback-playlist-stat">
                  <span>Current</span>
                  <strong>{playlistReport.status}</strong>
                </div>
                <div className="playback-playlist-stat">
                  <span>Completed</span>
                  <strong>
                    {playlistReport.totalVideos
                      ? `${playlistReport.completedCount}/${playlistReport.totalVideos}`
                      : "Waiting"}
                  </strong>
                </div>
              </div>

              <p>{playlistReport.summary}</p>
            </div>
          ) : null}

          {playlistVideoRows.length ? (
            <div className="playback-playlist-card">
              <div className="playback-panel-head">
                <span>Playlist Videos</span>
                <strong>{playlistVideoRows.length} total</strong>
              </div>

              <div className="playback-playlist-items">
                {playlistVideoRows.map((video) => (
                  <button
                    className={clsx(
                      "playback-playlist-item",
                      video.isCurrent && "current",
                      video.isCompleted && "done",
                    )}
                    disabled={!canUseAppControls}
                    key={video.videoId}
                    onClick={() => handlePlaylistVideoSelect(video.index)}
                    type="button"
                  >
                    <img
                      alt={video.label}
                      className="playback-playlist-thumb"
                      loading="lazy"
                      src={getYouTubeThumbnailUrl(video.videoId)}
                    />

                    <div className="playback-playlist-item-copy">
                      <div className="playback-playlist-item-head">
                        <strong>{video.label}</strong>
                        <span>
                          {video.isCompleted
                            ? "Completed"
                            : video.isCurrent
                              ? "Current"
                              : video.percent > 0
                                ? `${video.percent}% watched`
                                : "Queued"}
                        </span>
                      </div>

                      <div className="playback-playlist-item-meta">
                        {video.idLabel} · {video.progressLabel}
                      </div>

                      <div className="playback-playlist-item-bar">
                        <div
                          className="playback-playlist-item-fill"
                          style={{ width: `${video.percent}%` }}
                        />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="playback-insight-card">
            <div className="playback-panel-head">
              <span>{item.notes?.trim() ? "Your notes" : "Context"}</span>
            </div>
            <p>
              {insightCopy ||
                "Add notes on the dashboard and they will show up here so the player becomes part of your study flow, not a detached modal."}
            </p>
          </div>

          {item.tags.length ? (
            <div className="playback-tag-list">
              {item.tags.map((tag) => (
                <div className="playback-tag" key={tag.id}>
                  {tag.name}
                </div>
              ))}
            </div>
          ) : null}

          <div className="playback-system-note">
            <Sparkles size={16} />
            <span>
              {useIframeFallback
                ? "Fallback mode keeps the video available, but precise progress syncing depends on the YouTube API."
                : hasPlaylist
                  ? "This item is a playlist, so the app keeps a running completion report while Previous and Next stay available."
                  : "Finish the video and it will automatically be marked as done. Minimize the player anytime to keep it running in the background."}
            </span>
          </div>

          {playerError ? <div className="playback-error">{playerError}</div> : null}
        </aside>
      </section>
    </div>
  );
}
