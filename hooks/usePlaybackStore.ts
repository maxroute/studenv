"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  YouTubePlaylistProgress,
  YouTubePlaylistProgressInput,
} from "@/lib/utils/youtube";

export type PlaybackProgress = {
  seconds: number;
  duration?: number;
  updatedAt: number;
  playlist?: YouTubePlaylistProgress;
};

type PlaybackState = {
  activeItemId: string | null;
  isExpanded: boolean;
  isPlaying: boolean;
  progressByItemId: Record<string, PlaybackProgress>;
  openPlayer: (itemId: string) => void;
  expandPlayer: () => void;
  minimizePlayer: () => void;
  closePlayer: () => void;
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
};

export const usePlaybackStore = create<PlaybackState>()(
  persist(
    (set) => ({
      activeItemId: null,
      isExpanded: true,
      isPlaying: false,
      progressByItemId: {},
      openPlayer: (itemId) =>
        set((state) => ({
          activeItemId: itemId,
          isExpanded: true,
          isPlaying: state.activeItemId === itemId ? state.isPlaying : true,
        })),
      expandPlayer: () =>
        set((state) => (state.activeItemId ? { isExpanded: true } : state)),
      minimizePlayer: () =>
        set((state) => (state.activeItemId ? { isExpanded: false } : state)),
      closePlayer: () =>
        set({
          activeItemId: null,
          isExpanded: true,
          isPlaying: false,
        }),
      setPlaying: (value) =>
        set((state) => ({
          isPlaying: state.activeItemId ? value : false,
        })),
      setProgress: (itemId, progress) =>
        set((state) => {
          const previousProgress = state.progressByItemId[itemId];
          const nextDuration =
            typeof progress.duration === "number" &&
            Number.isFinite(progress.duration) &&
            progress.duration > 0
              ? progress.duration
              : previousProgress?.duration;
          const nextPlaylist = progress.playlist
            ? {
                currentIndex: Math.max(progress.playlist.currentIndex, 0),
                totalVideos: Math.max(progress.playlist.totalVideos, 0),
                furthestIndex: Math.max(
                  progress.playlist.furthestIndex,
                  progress.playlist.currentIndex,
                  previousProgress?.playlist?.furthestIndex ?? -1,
                ),
                videoIds:
                  progress.playlist.videoIds?.filter(Boolean) ??
                  previousProgress?.playlist?.videoIds ??
                  [],
                videosById: Object.entries({
                  ...(previousProgress?.playlist?.videosById ?? {}),
                  ...(progress.playlist.videosById ?? {}),
                }).reduce<NonNullable<YouTubePlaylistProgress["videosById"]>>(
                  (accumulator, [videoId, value]) => {
                    const previousVideo = previousProgress?.playlist?.videosById?.[videoId];
                    const nextDuration =
                      typeof value.duration === "number" &&
                      Number.isFinite(value.duration) &&
                      value.duration > 0
                        ? value.duration
                        : previousVideo?.duration;
                    const nextSeconds = Math.max(
                      typeof value.seconds === "number" && Number.isFinite(value.seconds)
                        ? value.seconds
                        : 0,
                      previousVideo?.seconds ?? 0,
                    );

                    accumulator[videoId] = {
                      videoId,
                      seconds: nextSeconds,
                      ...(nextDuration ? { duration: nextDuration } : {}),
                      completed:
                        Boolean(value.completed) ||
                        Boolean(previousVideo?.completed) ||
                        (typeof nextDuration === "number" && nextSeconds >= nextDuration - 1),
                      updatedAt: Date.now(),
                    };
                    return accumulator;
                  },
                  {},
                ),
                updatedAt: Date.now(),
              }
            : previousProgress?.playlist;

          return {
            progressByItemId: {
              ...state.progressByItemId,
              [itemId]: {
                seconds:
                  typeof progress.seconds === "number" &&
                  Number.isFinite(progress.seconds)
                    ? Math.max(progress.seconds, 0)
                    : 0,
                ...(nextDuration ? { duration: nextDuration } : {}),
                ...(nextPlaylist ? { playlist: nextPlaylist } : {}),
                updatedAt: Date.now(),
              },
            },
          };
        }),
      clearProgress: (itemId) =>
        set((state) => {
          const nextProgress = { ...state.progressByItemId };
          delete nextProgress[itemId];
          return { progressByItemId: nextProgress };
        }),
    }),
    {
      name: "second-brain-playback",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        progressByItemId: state.progressByItemId,
      }),
    },
  ),
);
