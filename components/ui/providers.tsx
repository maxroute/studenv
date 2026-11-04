"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";
import { useEffect, type PropsWithChildren } from "react";
import type { Session } from "next-auth";
import { SWRConfig } from "swr";
import { useRouter } from "next/navigation";
import { subscribeToAuthSync } from "@/lib/auth/auth-sync";

function AuthCrossTabSync() {
  const router = useRouter();

  useEffect(() => subscribeToAuthSync(() => {
    // Re-fetch server-rendered state after an auth action completes in another tab.
    router.refresh();
  }), [router]);

  return null;
}

function MobileAppInitializer() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const capacitor = (window as any).Capacitor;
    if (capacitor) {
      console.log("[MobileAppInitializer] Running inside Capacitor WebView");

      // Set dataset.desktopApp so that existing code knows we are in app wrapper
      document.documentElement.dataset.desktopApp = "true";

      const { App } = capacitor.Plugins || {};
      if (App) {
        const handleAppUrlOpen = async (event: { url: string }) => {
          console.log("[MobileAppInitializer] App opened with URL:", event.url);
          
          try {
            const parsedUrl = new URL(event.url);
            
            if (parsedUrl.protocol === "studenv:" && parsedUrl.hostname === "auth") {
              const token = parsedUrl.searchParams.get("token");
              if (token) {
                console.log("[MobileAppInitializer] Found session token in app URL, setting native cookies...");
                
                const CapacitorCookies = (window as any).CapacitorCookies || (window as any).Capacitor?.Plugins?.CapacitorCookies;
                if (CapacitorCookies) {
                  const domainUrl = window.location.origin;
                  
                  await CapacitorCookies.setCookie({
                    url: domainUrl,
                    key: "next-auth.session-token",
                    value: token,
                    path: "/",
                  });
                  
                  await CapacitorCookies.setCookie({
                    url: domainUrl,
                    key: "__Secure-next-auth.session-token",
                    value: token,
                    path: "/",
                  });
                  
                  console.log("[MobileAppInitializer] Cookies set successfully, redirecting to dashboard");
                  router.push("/dashboard");
                  router.refresh();
                } else {
                  console.warn("[MobileAppInitializer] CapacitorCookies plugin not found on window");
                }
              }
            }
          } catch (e) {
            console.error("[MobileAppInitializer] Error handling app URL open:", e);
          }
        };

        App.addListener("appUrlOpen", handleAppUrlOpen);

        return () => {
          App.removeAllListeners();
        };
      }
    }
  }, [router]);

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
      <MobileAppInitializer />
      <SWRConfig
        value={{
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
          refreshInterval: 0,
          dedupingInterval: 10000,
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
