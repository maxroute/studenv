import React from "react";
import { auth } from "@/lib/auth/auth.config";
import { redirect } from "next/navigation";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import { DashboardSidebar } from "./DashboardSidebar";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

import { DashboardLayoutClient } from "./DashboardLayoutClient";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/dashboard");
  }

  return (
    <div className={`${instrumentSans.variable} ${instrumentSerif.variable} font-sans`}>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </div>
  );
}
