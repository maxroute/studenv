"use client";

import useSWR from "swr";
import { apiFetcher } from "@/lib/client/fetcher";
import type { PublicProfile } from "@/types";

export type UserResponse = PublicProfile & {
  createdAt?: string;
};

export function useUser(fallbackData?: UserResponse) {
  const swr = useSWR<UserResponse>("/api/user/profile", apiFetcher, {
    fallbackData,
  });

  return {
    ...swr,
    user: swr.data ?? fallbackData,
  };
}
