"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";
import { useEffect, type PropsWithChildren } from "react";
import type { Session } from "next-auth";
import { SWRConfig } from "swr";
import { useRouter } from "next/navigation";
import { subscribeToAuthSync } from "@/lib/auth/auth-sync";
import { retryDelay, shouldRetry } from "@/lib/client/load-state";

function AuthCrossTabSync() {
  const router = useRouter();

  useEffect(() => subscribeToAuthSync(() => {
    // Re-fetch server-rendered state after an auth action completes in another tab.
    router.refresh();
  }), [router]);

  return null;
}

export function Providers({ children, session }: PropsWithChildren<{ session?: Session | null }>) {
  return (
    <SessionProvider
      session={session}
      refetchInterval={0}
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
    >
      <AuthCrossTabSync />
      <SWRConfig
        value={{
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
          refreshInterval: 0,
          dedupingInterval: 10000,
          // Retry sooner than SWR's 5 to 10 s, and never repeat a request the server refused.
          onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
            if (!shouldRetry(error, retryCount)) return;
            window.setTimeout(() => void revalidate({ retryCount }), retryDelay(retryCount));
          },
        }}
      >
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: "sb-toast",
            style: {
              background: "#161616",
              color: "#e8e0d5",
              border: "1px solid #2a2a2a",
            },
          }}
        />
      </SWRConfig>
    </SessionProvider>
  );
}
