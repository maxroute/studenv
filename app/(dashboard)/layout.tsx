import React from "react";
import { AppIntro } from "@/components/intro/app-intro";
import { auth } from "@/lib/auth/auth.config";
import { REQUEST_PATH_HEADER, signInPageFor } from "@/lib/auth/signed-in-redirect";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { instrumentSans, instrumentSerif } from "@/lib/fonts/app-fonts";
import { DashboardSidebar } from "./DashboardSidebar";

import { DashboardLayoutClient } from "./DashboardLayoutClient";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect(signInPageFor(headers().get(REQUEST_PATH_HEADER)));
  }

  return (
    <div className={`${instrumentSans.variable} ${instrumentSerif.variable}`}>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
      <AppIntro />
    </div>
  );
}
