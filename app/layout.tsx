
import { Analytics } from "@vercel/analytics/next"; import type { Metadata } from "next";
import type { ReactNode } from "react";
import { dmMono, dmSans, fraunces } from "@/lib/fonts/app-fonts";
import "@/app/globals.css";
import { BootLoaderGate } from "@/components/ui/boot-loader-gate";
import { Providers } from "@/components/ui/providers";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

export const metadata: Metadata = {
  metadataBase: getPublicSiteUrl(),
  title: "Studenv",
  description: "A production-ready personal knowledge management app.",
  icons: {
    icon: "/branding/browser-favicon.png",
    shortcut: "/branding/browser-favicon.png",
    apple: "/branding/browser-favicon.png",
  },
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
          <BootLoaderGate>{children}</BootLoaderGate>
          <div id="viewer-portal-root" className="fixed inset-0 pointer-events-none z-[9999]" />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
