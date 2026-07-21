import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Mono, DM_Sans, Fraunces } from "next/font/google";
import "@/app/globals.css";
import { BootLoaderGate } from "@/components/ui/boot-loader-gate";
import { Providers } from "@/components/ui/providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["300", "400", "500"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
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
      </body>
    </html>
  );
}
