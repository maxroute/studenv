
import { Analytics } from "@vercel/analytics/next"; import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { dmMono, dmSans, fraunces } from "@/lib/fonts/app-fonts";
import "@/app/globals.css";
import { BootLoaderGate } from "@/components/ui/boot-loader-gate";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import { Providers } from "@/components/ui/providers";
import { DesktopTimerBridge } from "@/components/focus/DesktopTimerBridge";
import { OfflineSupport } from "@/components/pwa/offline-support";
import { appleStartupImages } from "@/lib/pwa/apple-startup-images";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

export const metadata: Metadata = {
  metadataBase: getPublicSiteUrl(),
  title: "Studenv",
  description: "A production-ready personal knowledge management app.",
  icons: {
    icon: "/branding/browser-favicon.png",
    shortcut: "/branding/browser-favicon.png",
    apple: "/icons/app/apple-touch-icon.png",
  },
  // Installed on an iPhone or iPad from the Share menu ("Add to Home Screen").
  appleWebApp: {
    capable: true,
    title: "Studenv",
    statusBarStyle: "black",
    startupImage: appleStartupImages,
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${dmSans.variable} ${dmMono.variable} ${fraunces.variable}`}
      >
        <Providers>
          {/* Reads the address; in Suspense so static pages stay static. */}
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <DesktopTimerBridge />
          <OfflineSupport />
          <BootLoaderGate>{children}</BootLoaderGate>
          <div id="viewer-portal-root" className="fixed inset-0 pointer-events-none z-[9999]" />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
