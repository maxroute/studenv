"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Rnd } from "react-rnd";
import { X, Minus, MapPin, Maximize2, Minimize2, AlertCircle, Loader2, Save, ChevronLeft, ChevronRight, FileText, Maximize, Minimize, Play, Pause, Volume2, VolumeX, Music4, ExternalLink, Globe, Copy, Check } from "lucide-react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { useViewerStore } from "@/hooks/use-viewer-store";
import { useExport } from "@/hooks/useExport";
import { normalizeExternalUrl } from "@/lib/utils/asset-links";
import { buildYouTubeEmbedUrl, getYouTubePlaybackSource } from "@/lib/utils/youtube";
import { isDirectMediaLikeUrl } from "@/lib/utils/asset-links";

const CustomPdfViewer = dynamic(
  () => import("./pdf-viewer").then((mod) => mod.CustomPdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-200">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4" />
        <p className="text-slate-500 text-sm font-medium">Loading PDF engine...</p>
      </div>
    ),
  }
);

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  YouTube IFrame Player API helpers                                  */
/* ------------------------------------------------------------------ */

let ytApiReady = false;
let ytApiLoading = false;
const ytApiCallbacks: Array<() => void> = [];

function ensureYouTubeAPI(): Promise<void> {
  if (ytApiReady) return Promise.resolve();
  return new Promise((resolve) => {
    ytApiCallbacks.push(resolve);
    if (ytApiLoading) return;
    ytApiLoading = true;

    // The API calls this global when ready
    (window as any).onYouTubeIframeAPIReady = () => {
      ytApiReady = true;
      ytApiCallbacks.forEach((cb) => cb());
      ytApiCallbacks.length = 0;
    };

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
}

/* ------------------------------------------------------------------ */

interface FloatingViewerProps {
  id: string;
  title: string;
  type: "pdf" | "video" | "webpage";
  contentUrl: string;
  mediaKind?: string;
  mimeType?: string | null;
  sourceUrl?: string | null;
  sourceHost?: string | null;
  assetId?: string;
  revisionId?: string;
  currentTime?: number;
  seekToken?: number;
  zIndex?: number;
  onClose: () => void;
}

export function FloatingViewer({ 
  id, 
  title, 
  type, 
  contentUrl, 
  mediaKind,
  mimeType,
  sourceUrl,
  sourceHost,
  assetId, 
  revisionId, 
  currentTime,
  seekToken,
  zIndex,
  onClose 
}: FloatingViewerProps) {
  const params = useParams();
  const workspaceId = params.id as string;
  const { isExporting, exportProgress, triggerExport } = useExport({ workspaceId });
  const minimized = useViewerStore((state) => 
    state.viewers.find(v => v.id === id || v.assetId === id)?.minimized ?? false
  );
  const { setViewerMinimized, bringViewerToFront } = useViewerStore();
  const highestViewerZIndex = useViewerStore((state) =>
    Math.max(100, ...state.viewers.map((viewer) => viewer.zIndex ?? 100)),
  );
  const currentZIndex = zIndex ?? 100;
  const isTopViewer = currentZIndex >= highestViewerZIndex;
  const [maximized, setMaximized] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileViewerSize, setMobileViewerSize] = useState<{ width: number; height: number } | null>(null);
  const [mobileViewerPosition, setMobileViewerPosition] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      const mobile = media.matches;
      setIsMobileViewport(mobile);
      if (mobile) {
        const width = Math.max(280, Math.min(window.innerWidth - 16, 560));
        const height = Math.max(220, Math.min(Math.round(window.innerHeight * 0.62), window.innerHeight - 100));
        setMobileViewerSize((current) => current ?? { width, height });
        setMobileViewerPosition((current) => current ?? {
          x: Math.max(8, Math.round((window.innerWidth - width) / 2)),
          y: Math.max(8, window.innerHeight - height - 24),
        });
      }
    };
    update();
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const [hasError, setHasError] = useState(false);
  const [mediaErrorText, setMediaErrorText] = useState("The format may not be supported or the file is corrupted.");
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinNote, setPinNote] = useState("");
  const [pinTimestampMs, setPinTimestampMs] = useState(0);
  const pinButtonRef = useRef<HTMLButtonElement | null>(null);
  const [pinPopoverPosition, setPinPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!showPinForm) {
      setPinPopoverPosition(null);
      return;
    }
    const updatePosition = () => {
      const anchor = pinButtonRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(288, window.innerWidth - 24);
      const estimatedHeight = 230;
      const left = Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12));
      const below = anchor.bottom + 8;
      const top = below + estimatedHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, anchor.top - estimatedHeight - 8);
      setPinPopoverPosition({ top, left });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showPinForm]);

  const livePlaybackTimeRef = useRef<number>(currentTime ?? 0);
  const playbackPollRef = useRef<number | null>(null);
  const [youTubeHost, setYouTubeHost] = useState<"youtube" | "youtube-nocookie">("youtube");
  const [useYouTubeIframeFallback, setUseYouTubeIframeFallback] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error("Failed to enter fullscreen mode", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error("Failed to exit fullscreen mode", err);
      });
    }
  };

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const isVideo = type === "video";
  const isPdf = type === "pdf";
  const isWebpage = type === "webpage";
  const isAudio = isVideo && (mediaKind === "audio" || mimeType?.startsWith("audio/"));
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [scrollToPage, setScrollToPage] = useState<{ page: number, token: number } | undefined>(undefined);
  const [mediaDurationMs, setMediaDurationMs] = useState(0);
  const [mediaCurrentTimeMs, setMediaCurrentTimeMs] = useState(currentTime ?? 0);
  const [isMediaPlaying, setIsMediaPlaying] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.85);
  const [audioMuted, setAudioMuted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [webPreviewLoading, setWebPreviewLoading] = useState(false);
  const [webPreview, setWebPreview] = useState<{
    title: string;
    description: string | null;
    image: string | null;
    siteName: string | null;
    url: string;
    host: string | null;
  } | null>(null);
  const handlePdfPageChange = useCallback((page: number) => {
    setPdfCurrentPage(page);
  }, []);
  const handlePdfTotalPages = useCallback((total: number) => {
    setPdfPageCount(total);
  }, []);
  const syncAudioMetrics = useCallback((element: HTMLAudioElement) => {
    const rawDurationSeconds = element.duration;
    const seekableDurationSeconds =
      element.seekable.length > 0 ? element.seekable.end(element.seekable.length - 1) : 0;
    const resolvedDurationSeconds =
      Number.isFinite(rawDurationSeconds) && rawDurationSeconds > 0
        ? rawDurationSeconds
        : seekableDurationSeconds;

    const nextDurationMs =
      Number.isFinite(resolvedDurationSeconds) && resolvedDurationSeconds > 0
        ? Math.round(resolvedDurationSeconds * 1000)
        : 0;
    const nextCurrentTimeMs = Math.round((element.currentTime || 0) * 1000);

    livePlaybackTimeRef.current = nextCurrentTimeMs;
    setMediaDurationMs(nextDurationMs);
    setMediaCurrentTimeMs(nextCurrentTimeMs);
  }, []);
  const youTubeSource = useMemo(
    () => (isVideo && !isAudio ? getYouTubePlaybackSource(contentUrl) : null),
    [contentUrl, isAudio, isVideo],
  );
  const isLikelyYouTubeUrl = useMemo(() => {
    if (!isVideo || isAudio || !contentUrl) {
      return false;
    }

    try {
      const parsed = new URL(contentUrl.startsWith("http") ? contentUrl : `https://${contentUrl}`);
      const hostname = parsed.hostname.toLowerCase();
      return (
        hostname === "youtu.be" ||
        hostname === "youtube.com" ||
        hostname === "www.youtube.com" ||
        hostname === "m.youtube.com" ||
        hostname === "youtube-nocookie.com" ||
        hostname === "www.youtube-nocookie.com"
      );
    } catch {
      return false;
    }
  }, [contentUrl, isAudio, isVideo]);
  const isDirectPlayableVideoUrl = useMemo(() => {
    if (!isVideo || isAudio || !contentUrl) {
      return false;
    }

    if (mimeType?.startsWith("video/")) {
      return true;
    }

    return isDirectMediaLikeUrl(contentUrl);
  }, [contentUrl, isAudio, isVideo, mimeType]);
  const externalSourceUrl = useMemo(() => {
    const candidateUrl = sourceUrl || contentUrl;
    if (!candidateUrl || !candidateUrl.startsWith("http")) {
      return null;
    }

    try {
      return normalizeExternalUrl(candidateUrl).toString();
    } catch {
      return candidateUrl;
    }
  }, [contentUrl, sourceUrl]);
  const externalSourceHost = useMemo(() => {
    if (!externalSourceUrl) {
      return "";
    }

    try {
      return new URL(externalSourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }, [externalSourceUrl]);

  useEffect(() => {
    if (!isWebpage || !assetId) {
      setWebPreview(null);
      setWebPreviewLoading(false);
      return;
    }

    let active = true;
    setWebPreviewLoading(true);

    fetch(`/api/assets/${assetId}/preview`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load webpage preview");
        }
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        setWebPreview(payload);
      })
      .catch((error) => {
        console.warn("Failed to load webpage preview", error);
        if (!active) return;
        setWebPreview(null);
      })
      .finally(() => {
        if (active) {
          setWebPreviewLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [assetId, isWebpage]);

  useEffect(() => {
    setYouTubeHost("youtube");
    setUseYouTubeIframeFallback(false);
    setHasError(false);
    setMediaErrorText("The format may not be supported or the file is corrupted.");
  }, [contentUrl]);

  useEffect(() => {
    livePlaybackTimeRef.current = currentTime ?? 0;
    setMediaCurrentTimeMs(currentTime ?? 0);
  }, [currentTime]);

  useEffect(() => {
    const element = audioPlayerRef.current;
    if (!element || !isAudio) {
      return;
    }

    element.volume = audioMuted ? 0 : audioVolume;
    element.muted = audioMuted;
  }, [audioMuted, audioVolume, isAudio]);

  useEffect(() => {
    if (!isAudio) {
      setMediaDurationMs(0);
      setIsMediaPlaying(false);
      return;
    }

    const element = audioPlayerRef.current;
    if (!element) {
      return;
    }

    const handleLoaded = () => syncAudioMetrics(element);
    const handleTimeUpdate = () => {
      const nextMs = Math.round((element.currentTime || 0) * 1000);
      livePlaybackTimeRef.current = nextMs;
      setMediaCurrentTimeMs(nextMs);
      if (element.duration <= 0) {
        syncAudioMetrics(element);
      }
    };

    handleLoaded();
    element.addEventListener("loadedmetadata", handleLoaded);
    element.addEventListener("loadeddata", handleLoaded);
    element.addEventListener("durationchange", handleLoaded);
    element.addEventListener("canplay", handleLoaded);
    element.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      element.removeEventListener("loadedmetadata", handleLoaded);
      element.removeEventListener("loadeddata", handleLoaded);
      element.removeEventListener("durationchange", handleLoaded);
      element.removeEventListener("canplay", handleLoaded);
      element.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [isAudio, syncAudioMetrics]);

  useEffect(() => {
    if (!isAudio || !contentUrl) {
      return;
    }

    const probe = new Audio();
    probe.preload = "metadata";
    probe.src = contentUrl;

    const syncProbeMetrics = () => {
      const rawDurationSeconds = probe.duration;
      if (Number.isFinite(rawDurationSeconds) && rawDurationSeconds > 0) {
        setMediaDurationMs(Math.round(rawDurationSeconds * 1000));
      }
    };

    probe.addEventListener("loadedmetadata", syncProbeMetrics);
    probe.addEventListener("durationchange", syncProbeMetrics);
    probe.addEventListener("canplay", syncProbeMetrics);
    probe.load();

    return () => {
      probe.removeEventListener("loadedmetadata", syncProbeMetrics);
      probe.removeEventListener("durationchange", syncProbeMetrics);
      probe.removeEventListener("canplay", syncProbeMetrics);
      probe.src = "";
    };
  }, [contentUrl, isAudio]);

  useEffect(() => {
    if (!isPdf || !contentUrl) {
      return;
    }

    let active = true;

    const loadPdfPageCount = async () => {
      try {
        const response = await fetch(contentUrl);
        if (!response.ok) {
          return;
        }

        const data = await response.arrayBuffer();
        const { PDFDocument } = await import("pdf-lib");
        const pdf = await PDFDocument.load(data);

        if (active) {
          const total = pdf.getPageCount();
          setPdfPageCount(total);
          setPdfCurrentPage((current) => Math.min(Math.max(current, 1), Math.max(total, 1)));
        }
      } catch (error) {
        console.warn("Failed to load PDF page count", error);
      }
    };

    void loadPdfPageCount();

    return () => {
      active = false;
    };
  }, [contentUrl, isPdf]);

  const scrollToPdfPage = useCallback((pageNumber: number) => {
    setPdfCurrentPage(pageNumber);
    setScrollToPage({ page: pageNumber, token: Date.now() });
  }, []);

  const youTubeEmbedUrl = useMemo(() => {
    if (!youTubeSource) {
      return null;
    }

    return buildYouTubeEmbedUrl(youTubeSource, {
      host: youTubeHost,
      startAt: currentTime ? currentTime / 1000 : 0,
      enableJsApi: true,
    });
  }, [currentTime, youTubeHost, youTubeSource]);

  // Initialize YouTube IFrame Player API
  useEffect(() => {
    if (!youTubeSource?.videoId || minimized) return;

    let player: any = null;
    let destroyed = false;
    let fallbackTimer: number | null = null;

    const initPlayer = async () => {
      try {
        fallbackTimer = window.setTimeout(() => {
          if (!destroyed) {
            setUseYouTubeIframeFallback(true);
          }
        }, 10000);

        await ensureYouTubeAPI();
      } catch {
        if (!destroyed) {
          setUseYouTubeIframeFallback(true);
        }
        return;
      }

      if ((window as any).YT?.Player == null) {
        if (!destroyed) {
          setUseYouTubeIframeFallback(true);
        }
        return;
      }

      if (destroyed || !ytContainerRef.current) return;

      // Create a unique div for the player
      const playerDiv = document.createElement("div");
      playerDiv.id = `yt-player-${id}-${Date.now()}`;
      ytContainerRef.current.innerHTML = "";
      ytContainerRef.current.appendChild(playerDiv);

      const host = youTubeHost === "youtube-nocookie"
        ? "https://www.youtube-nocookie.com"
        : "https://www.youtube.com";

      player = new (window as any).YT.Player(playerDiv.id, {
        videoId: youTubeSource.videoId,
        host,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 1,
          playsinline: 1,
          rel: 0,
          start: currentTime ? Math.floor(currentTime / 1000) : 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (!destroyed) {
              if (fallbackTimer) {
                window.clearTimeout(fallbackTimer);
              }
              setUseYouTubeIframeFallback(false);
              ytPlayerRef.current = player;
            }
          },
          onError: () => {
            if (!destroyed) {
              setUseYouTubeIframeFallback(true);
            }
          },
        },
      });
    };

    void initPlayer();

    return () => {
      destroyed = true;
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      if (player && typeof player.destroy === "function") {
        try { player.destroy(); } catch { /* ignore */ }
      }
      ytPlayerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youTubeSource?.videoId, youTubeHost, minimized]);

  // Handle seekTo from viewer store (when clicking a note's play button)
  useEffect(() => {
    if (!isVideo || currentTime === undefined) return;
    
    // YouTube player seek
    if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === "function") {
      ytPlayerRef.current.seekTo(currentTime / 1000, true);
      return;
    }

    // Native video seek
    const nativePlayer = audioPlayerRef.current ?? videoPlayerRef.current;
    if (nativePlayer) {
      nativePlayer.currentTime = currentTime / 1000;
    }
  }, [currentTime, isVideo, seekToken]);

  useEffect(() => {
    if (!isVideo || minimized) {
      if (playbackPollRef.current !== null) {
        window.clearInterval(playbackPollRef.current);
        playbackPollRef.current = null;
      }
      return;
    }

    const updateLivePlaybackTime = () => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
        const seconds = ytPlayerRef.current.getCurrentTime();
        if (typeof seconds === "number" && Number.isFinite(seconds)) {
          livePlaybackTimeRef.current = Math.round(seconds * 1000);
          return;
        }
      }

      const nativePlayer = audioPlayerRef.current ?? videoPlayerRef.current;
      if (nativePlayer && Number.isFinite(nativePlayer.currentTime)) {
        const nextMs = Math.round(nativePlayer.currentTime * 1000);
        livePlaybackTimeRef.current = nextMs;
        setMediaCurrentTimeMs(nextMs);
      }
    };

    updateLivePlaybackTime();
    playbackPollRef.current = window.setInterval(updateLivePlaybackTime, 250);

    return () => {
      if (playbackPollRef.current !== null) {
        window.clearInterval(playbackPollRef.current);
        playbackPollRef.current = null;
      }
    };
  }, [isVideo, minimized, useYouTubeIframeFallback, youTubeSource?.videoId]);

  const toggleNativePlayback = useCallback(() => {
    const element = audioPlayerRef.current;
    if (!element) return;

    if (element.paused) {
      element.play().catch((error) => {
        console.warn("Failed to start playback", error);
      });
      return;
    }

    element.pause();
  }, []);

  const handleTimelineChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextMs = Number(event.target.value);
    setMediaCurrentTimeMs(nextMs);
    livePlaybackTimeRef.current = nextMs;

    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = nextMs / 1000;
    }
  }, []);

  const handleVolumeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = Number(event.target.value);
    setAudioVolume(nextVolume);
    setAudioMuted(nextVolume === 0);
  }, []);
  const handleCopyLink = useCallback(async () => {
    if (!externalSourceUrl) return;

    try {
      await navigator.clipboard.writeText(externalSourceUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1500);
    } catch (error) {
      console.warn("Failed to copy link", error);
    }
  }, [externalSourceUrl]);

  /** Get the current playback time in milliseconds */
  const getCurrentTimeMs = useCallback((): number => {
    // Read directly from the active player at click time. The polling ref can
    // still be zero briefly while the YouTube iframe is initializing on mobile.
    const youtubeTime = ytPlayerRef.current?.getCurrentTime?.();
    if (typeof youtubeTime === "number" && Number.isFinite(youtubeTime) && youtubeTime >= 0) {
      const exactMs = Math.round(youtubeTime * 1000);
      livePlaybackTimeRef.current = exactMs;
      return exactMs;
    }

    const nativePlayer = audioPlayerRef.current ?? videoPlayerRef.current;
    if (nativePlayer && Number.isFinite(nativePlayer.currentTime) && nativePlayer.currentTime >= 0) {
      const exactMs = Math.round(nativePlayer.currentTime * 1000);
      livePlaybackTimeRef.current = exactMs;
      return exactMs;
    }

    return Number.isFinite(livePlaybackTimeRef.current) && livePlaybackTimeRef.current >= 0
      ? livePlaybackTimeRef.current
      : 0;
  }, []);

  function formatTimestamp(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) {
      return "0:00";
    }
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function handlePinConfirm() {
    const { addItem, viewport, items } = useWorkspaceStore.getState();
    if (!assetId) return;

    // Place the note to the right of the viewer, not under it
    const x = -viewport.x / viewport.zoom + 600;
    const y = -viewport.y / viewport.zoom + 80 + (items.filter(i => i.type === "video-anchor").length * 30);

    addItem("video-anchor", {
      assetId,
      revisionId: revisionId ?? "",
      startTimeMs: pinTimestampMs,
      w: 240,
      h: pinNote.trim() ? 160 : 120,
      label: title,
      notes: pinNote.trim() || undefined,
      color: "#F8E7A1",
    }, { x, y });
    setShowPinForm(false);
    setPinNote("");
  }

  // This should be rendered in a portal
  const normalizedDurationMs = Math.max(mediaDurationMs, 0);
  const normalizedCurrentTimeMs =
    normalizedDurationMs > 0
      ? Math.min(Math.max(mediaCurrentTimeMs, 0), normalizedDurationMs)
      : Math.max(mediaCurrentTimeMs, 0);
  const progressPercent =
    normalizedDurationMs > 0 ? (normalizedCurrentTimeMs / normalizedDurationMs) * 100 : 0;
  const volumePercent = Math.max(0, Math.min((audioMuted ? 0 : audioVolume) * 100, 100));
  const content = (
    <Rnd
      default={{
        x: 100,
        y: 100,
        width: 500,
        height: 400,
      }}
      size={maximized ? { width: "100%", height: "100%" } : isMobileViewport ? (mobileViewerSize ?? undefined) : undefined}
      position={maximized ? { x: 0, y: 0 } : isMobileViewport ? (mobileViewerPosition ?? undefined) : undefined}
      onDrag={isMobileViewport ? (_event, data) => setMobileViewerPosition({ x: data.x, y: data.y }) : undefined}
      onDragStop={isMobileViewport ? (_event, data) => setMobileViewerPosition({ x: data.x, y: data.y }) : undefined}
      onResize={isMobileViewport ? (_event, _direction, ref, _delta, position) => {
        setMobileViewerSize({ width: ref.offsetWidth, height: ref.offsetHeight });
        setMobileViewerPosition(position);
      } : undefined}
      onResizeStop={isMobileViewport ? (_event, _direction, ref, _delta, position) => {
        setMobileViewerSize({ width: ref.offsetWidth, height: ref.offsetHeight });
        setMobileViewerPosition(position);
      } : undefined}
      minWidth={280}
      minHeight={180}
      bounds="window"
      cancel="button, input, textarea, select, a, [data-no-viewer-drag]"
      disableDragging={maximized}
      enableResizing={!maximized && !minimized}
      style={{
        display: minimized ? "none" : undefined,
        zIndex: currentZIndex,
      }}
      className={`workspace-floating-viewer bg-white shadow-2xl rounded-lg border overflow-hidden flex flex-col pointer-events-auto ${
        maximized ? "rounded-none! border-none!" : ""
      }`}
      dragHandleClassName="viewer-drag-handle"
    >
      <div
        ref={containerRef}
        className="flex flex-col w-full h-full relative bg-white"
        onPointerDownCapture={() => bringViewerToFront(id)}
      >
      {!isTopViewer && (
        <button
          aria-label={`Bring ${title} viewer to front`}
          className="absolute inset-0 z-[100] cursor-default bg-transparent"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            bringViewerToFront(id);
          }}
          type="button"
        />
      )}
      {/* Header */}
      <div className="viewer-drag-handle flex items-center justify-between px-3 py-2 bg-slate-50 border-b cursor-move group">
        <div className="flex items-center gap-2 overflow-hidden mr-4">
          <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
            <div className="w-1 h-1 rounded-full bg-slate-400" />
            <div className="w-1 h-1 rounded-full bg-slate-400" />
            <div className="w-1 h-1 rounded-full bg-slate-400" />
          </div>
          <span className="text-xs font-semibold text-slate-700 truncate">{title}</span>
        </div>
        
        <div className="flex items-center gap-1 shrink-0">
          {type === "video" && youTubeSource ? (
            <button
              onClick={() =>
                setYouTubeHost((prev) =>
                  prev === "youtube" ? "youtube-nocookie" : "youtube",
                )
              }
              className="p-1 px-2 hover:bg-slate-200 rounded text-slate-600 flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider"
              title="Switch YouTube embed host"
            >
              {youTubeHost === "youtube" ? "youtube.com" : "nocookie"}
            </button>
          ) : null}
          {type === "pdf" && assetId && (
            <button 
              disabled={isExporting}
              onClick={() => {
                triggerExport(assetId, revisionId || "", []).catch(console.error);
              }}
              className="p-1 px-2 hover:bg-slate-200 rounded text-slate-600 flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider disabled:opacity-50"
              title="Save to Vault"
            >
              {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              {isExporting ? `${exportProgress}%` : "Save"}
            </button>
          )}
          {type === "pdf" && (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">
              <button
                onClick={() => scrollToPdfPage(Math.max(1, pdfCurrentPage - 1))}
                disabled={pdfCurrentPage <= 1}
                className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                title="Previous page"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="min-w-16 text-center tabular-nums">
                {pdfCurrentPage} / {pdfPageCount || "?"}
              </span>
              <button
                onClick={() => scrollToPdfPage(Math.min(Math.max(pdfPageCount, 1), pdfCurrentPage + 1))}
                disabled={pdfPageCount === 0 || pdfCurrentPage >= pdfPageCount}
                className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                title="Next page"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="relative">
            {type === "pdf" ? (
              <button 
                onClick={() => {
                  if (!assetId) return;
                  const { addShape } = useWorkspaceStore.getState();
                  addShape("pdf-fragment", { 
                    assetId, 
                    revisionId: revisionId ?? "",
                    pageNumber: pdfCurrentPage,
                    w: 300, 
                    h: 400,
                    crop: { x: 0, y: 0, width: 100, height: 100 },
                  });
                }} 
                className="p-1 px-2 hover:bg-slate-200 rounded text-slate-600 flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider"
                title="Add page stamp to canvas"
              >
                <MapPin className="w-3 h-3" />
                Page Stamp
              </button>
            ) : (
            <button
              ref={pinButtonRef}
              type="button"
              onClick={() => {
                if (!assetId) return;
                const ms = getCurrentTimeMs();
                setPinTimestampMs(ms);
                setPinNote("");
                setShowPinForm(true);
              }} 
              className="p-1 px-2 hover:bg-slate-200 rounded text-slate-600 flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider"
              title="Pin timestamp note to Canvas"
            >
              <MapPin className="w-3 h-3" />
              Pin
            </button>
            )}

            {/* Portal keeps the note popover clear of the viewer's clipped header/surface. */}
            {showPinForm && pinPopoverPosition && typeof document !== "undefined" && createPortal(
              <div
                role="dialog"
                aria-label="Pin timestamp note"
                onPointerDown={(event) => event.stopPropagation()}
                className="fixed z-[10000] w-[min(288px,calc(100vw-24px))] overflow-hidden rounded-sm border border-amber-900/15 bg-[#F8E7A1] text-slate-800 shadow-[0_10px_24px_rgba(40,34,20,0.18)]"
                style={{ top: pinPopoverPosition.top, left: pinPopoverPosition.left }}
              >
                <div className="flex items-center justify-between gap-3 border-b border-amber-900/10 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <MapPin className="h-3 w-3 shrink-0 text-slate-700/70" />
                    <span className="truncate text-[11px] font-semibold text-slate-800">Pin Timestamp Note</span>
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-md bg-slate-900/10 px-2 py-1 text-[10px] font-mono font-semibold tabular-nums text-slate-800">
                    {formatTimestamp(pinTimestampMs)}
                  </span>
                </div>
                <div className="space-y-2 p-2.5">
                  <textarea
                    autoFocus
                    placeholder="Write something..."
                    value={pinNote}
                    onChange={(e) => setPinNote(e.target.value)}
                    rows={4}
                    style={{
                      width: "100%",
                      minHeight: 108,
                      height: 108,
                      margin: 0,
                      padding: "8px 2px",
                      border: "0",
                      borderRadius: 0,
                      outline: "none",
                      boxShadow: "none",
                      background: "transparent",
                      color: "#1F2937",
                      fontSize: 12,
                      lineHeight: 1.5,
                      resize: "none",
                    }}
                    className="!border-0 !bg-transparent !shadow-none focus:!border-0 focus:!shadow-none focus:!outline-none placeholder:!text-slate-700/40"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handlePinConfirm();
                      }
                      if (e.key === "Escape") setShowPinForm(false);
                    }}
                  />
                  <div className="flex items-center justify-between gap-2 border-t border-amber-900/10 pt-2">
                    <span className="text-[10px] leading-tight text-slate-700/65">Ctrl+Enter to confirm</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowPinForm(false)}
                        style={{ width: "auto", minHeight: 32, padding: "6px 10px", background: "transparent", color: "#334155", border: 0 }}
                        className="rounded-sm text-[11px] font-medium hover:bg-black/5"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handlePinConfirm}
                        style={{ width: "auto", minWidth: 92, minHeight: 36, padding: "7px 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#4F46E5", color: "#FFFFFF", border: "1px solid #4338CA", borderRadius: 6, whiteSpace: "nowrap", opacity: 1, visibility: "visible" }}
                        className="!text-white rounded-md text-[12px] font-semibold shadow-sm hover:!bg-indigo-700"
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "#FFFFFF" }} />
                        <span style={{ display: "inline-block", color: "#FFFFFF", opacity: 1, visibility: "visible", whiteSpace: "nowrap", lineHeight: "18px" }}>Pin Note</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )}
          </div>
          <div className="w-px h-4 bg-slate-300 mx-1" />
          <button onClick={() => {
            setViewerMinimized(id, true);
            if (maximized) setMaximized(false);
          }} className="p-1.5 hover:bg-slate-200 text-slate-500 rounded transition-colors" title="Minimize">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setMaximized(!maximized)} className="p-1.5 hover:bg-slate-200 text-slate-500 rounded transition-colors" title={maximized ? "Restore" : "Maximize"}>
            {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={toggleFullscreen} className="p-1.5 hover:bg-slate-200 text-slate-500 rounded transition-colors" title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-red-100 text-red-500 hover:text-red-700 rounded transition-colors ml-1" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Surface */}
      <div
        className={`flex-1 relative overflow-hidden group/surface min-h-0 ${
          type === "video" ? (isAudio ? "bg-[#f7f1e8]" : "bg-black") : "bg-slate-100"
        }`}
      >
          {hasError && !isPdf && !isWebpage ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2 p-6 text-center">
              <AlertCircle className="w-8 h-8 text-slate-400 mb-2" />
              <p className="font-medium text-sm text-slate-700">Failed to load media</p>
              <p className="text-xs">{mediaErrorText}</p>
            </div>
          ) : type === "pdf" ? (
            <div className="absolute inset-0 flex min-h-0 bg-slate-200">
              <CustomPdfViewer
                contentUrl={contentUrl}
                assetId={assetId}
                documentTitle={title}
                onPageChange={handlePdfPageChange}
                onTotalPages={handlePdfTotalPages}
                scrollToPage={scrollToPage}
              />
            </div>
          ) : isWebpage ? (
            <div className="absolute inset-0 overflow-auto bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.08),_rgba(248,250,252,1)_38%,_rgba(241,245,249,1)_100%)] p-6">
              <div className="mx-auto flex max-w-2xl flex-col gap-5">
                <div className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 shadow-sm">
                        <Globe className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-500">
                          Web Resource
                        </div>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                          {webPreview?.title || title}
                        </h2>
                        <p className="mt-2 text-sm text-slate-500">
                          {webPreview?.siteName || sourceHost || externalSourceHost || "External link"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                      >
                        {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedLink ? "Copied" : "Copy link"}
                      </button>
                      {externalSourceUrl ? (
                        <a
                          href={externalSourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open source
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                    {webPreviewLoading
                      ? "Loading preview..."
                      : webPreview?.description ||
                        "This saved link is treated as a webpage resource. You can open it in a new tab, keep it in the vault, and attach it to the workspace without pretending it is a raw media file."}
                  </div>
                </div>

                {webPreview?.image ? (
                  <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
                    <img
                      src={webPreview.image}
                      alt={webPreview.title}
                      className="h-[320px] w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 p-10 text-center text-sm text-slate-400 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                    Preview image unavailable for this link.
                  </div>
                )}

                {externalSourceUrl ? (
                  <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Source URL
                    </div>
                    <div className="mt-2 break-all text-sm text-slate-600">{externalSourceUrl}</div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : youTubeSource?.videoId && !useYouTubeIframeFallback ? (
            <div 
              ref={ytContainerRef}
              className="absolute inset-0 bg-black"
              style={{ width: "100%", height: "100%" }}
            />
          ) : youTubeEmbedUrl ? (
            <iframe
              src={youTubeEmbedUrl}
              className="absolute inset-0 h-full w-full border-none bg-black"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              title={title}
            />
          ) : isLikelyYouTubeUrl ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2 p-6 text-center bg-white">
              <AlertCircle className="w-8 h-8 text-slate-400 mb-2" />
              <p className="font-medium text-sm text-slate-700">Invalid YouTube URL</p>
              <p className="text-xs">Use a full video or playlist link so the workspace can embed playback.</p>
            </div>
          ) : isAudio ? (
            <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,224,178,0.95),_rgba(255,247,237,0.98)_38%,_rgba(247,241,232,1)_100%)]">
              <audio
                ref={audioPlayerRef}
                className="hidden"
                preload="auto"
                crossOrigin="anonymous"
                src={contentUrl}
                onLoadedMetadata={(event) => syncAudioMetrics(event.currentTarget)}
                onLoadedData={(event) => syncAudioMetrics(event.currentTarget)}
                onDurationChange={(event) => syncAudioMetrics(event.currentTarget)}
                onCanPlay={(event) => syncAudioMetrics(event.currentTarget)}
                onPlay={() => setIsMediaPlaying(true)}
                onPause={() => setIsMediaPlaying(false)}
                onEnded={() => setIsMediaPlaying(false)}
                onError={(e) => {
                  console.warn("HTMLAudioElement error:", e);
                  setHasError(true);
                }}
              />
              <div className="absolute -left-20 top-10 h-56 w-56 rounded-full bg-amber-200/50 blur-3xl" />
              <div className="absolute -right-12 bottom-10 h-48 w-48 rounded-full bg-orange-200/50 blur-3xl" />
              <div className="relative flex h-full flex-col justify-between p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-700 shadow-sm backdrop-blur">
                      <Music4 className="h-3.5 w-3.5" />
                      Audio
                    </div>
                    <h3 className="mt-4 max-w-[20rem] text-2xl font-semibold tracking-tight text-slate-900">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                      Stay in the workspace while the audio keeps playing.
                    </p>
                  </div>
                  <div className="hidden items-end gap-2 md:flex">
                    {[0, 1, 2, 3, 4, 5, 6].map((index) => (
                      <span
                        key={index}
                        className={`w-2 rounded-full bg-slate-900/80 transition-all duration-300 ${
                          isMediaPlaying ? "animate-pulse" : ""
                        }`}
                        style={{ height: `${24 + ((index % 3) + 1) * 12}px`, animationDelay: `${index * 90}ms` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/80 bg-white/80 p-5 shadow-[0_24px_50px_rgba(148,97,38,0.12)] backdrop-blur-xl">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={toggleNativePlayback}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/20 transition-transform hover:scale-[1.03]"
                      title={isMediaPlaying ? "Pause audio" : "Play audio"}
                    >
                      {isMediaPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
                        <span>{formatTimestamp(normalizedCurrentTimeMs)}</span>
                        <span>{normalizedDurationMs > 0 ? formatTimestamp(normalizedDurationMs) : "--:--"}</span>
                      </div>
                      <div className="relative h-7">
                        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full border border-slate-500 bg-[#dbe2eb] shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)]" />
                        <div
                          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-slate-900"
                          style={{ width: `${progressPercent}%` }}
                        />
                        <div
                          className="absolute top-1/2 h-[16px] w-[16px] -translate-y-1/2 rounded-full border border-slate-900 bg-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.28)]"
                          style={{ left: `clamp(8px, ${progressPercent}%, calc(100% - 8px))`, transform: "translate(-50%, -50%)" }}
                        />
                        <input
                          type="range"
                          min={0}
                          max={Math.max(normalizedDurationMs, 1)}
                          value={Math.min(normalizedCurrentTimeMs, Math.max(normalizedDurationMs, 1))}
                          onChange={handleTimelineChange}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={() => setAudioMuted((prev) => !prev)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-slate-700 transition-colors hover:bg-amber-100 hover:text-slate-900"
                      title={audioMuted ? "Unmute" : "Mute"}
                    >
                      {audioMuted || audioVolume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                    <div className="relative h-7 w-32">
                      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full border border-slate-500 bg-[#dbe2eb] shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)]" />
                      <div
                        className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-slate-900"
                        style={{ width: `${volumePercent}%` }}
                      />
                      <div
                        className="absolute top-1/2 h-[16px] w-[16px] -translate-y-1/2 rounded-full border border-slate-900 bg-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.28)]"
                        style={{ left: `clamp(8px, ${volumePercent}%, calc(100% - 8px))`, transform: "translate(-50%, -50%)" }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={audioMuted ? 0 : audioVolume}
                        onChange={handleVolumeChange}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                    </div>
                    <div className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Local Audio
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : isVideo && !isAudio && !isLikelyYouTubeUrl && !isDirectPlayableVideoUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.16),_rgba(15,23,42,0.92)_42%,_rgba(2,6,23,0.98)_100%)] p-6 text-white">
              <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-xl">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <Globe className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">This link is not a direct video file</h3>
                <p className="mt-2 text-sm text-slate-300">
                  {externalSourceHost
                    ? `The saved resource points to ${externalSourceHost}, so it should open as a webpage or embedded post instead of a raw MP4 player.`
                    : "This resource looks like a webpage or social post, not a raw video file."}
                </p>
                {externalSourceUrl ? (
                  <a
                    href={externalSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Source
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="workspace-video-player absolute inset-0 bg-black">
              <video
                ref={videoPlayerRef}
                className="absolute inset-0 h-full w-full bg-black"
                controls
                controlsList="nodownload"
                crossOrigin="anonymous"
                onError={(e) => {
                  console.warn("HTMLVideoElement error:", e);
                  setHasError(true);
                }}
                playsInline
                src={contentUrl}
                style={{ objectFit: "contain" }}
              />
            </div>
          )}
      </div>
      </div>
    </Rnd>
  );

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  let portalRoot = document.getElementById("viewer-portal-root");
  if (!portalRoot) {
    if (typeof document !== 'undefined' && document.body) {
      portalRoot = document.createElement("div");
      portalRoot.id = "viewer-portal-root";
      portalRoot.className = "fixed inset-0 pointer-events-none z-[9999]";
      document.body.appendChild(portalRoot);
    } else {
      console.error("Portal root not found and unable to create it.");
      return content;
    }
  }

  return createPortal(content, portalRoot);
}
