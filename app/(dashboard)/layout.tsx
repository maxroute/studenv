import React from "react";
import { cookies } from "next/headers";
import { AppIntro } from "@/components/intro/app-intro";
import { INTRO_COOKIE } from "@/lib/client/intro";
import { auth } from "@/lib/auth/auth.config";
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
    redirect("/auth/signin?callbackUrl=/dashboard");
  }

  return (
    <div className={`${instrumentSans.variable} ${instrumentSerif.variable}`}>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
      <AppIntro show={!cookies().has(INTRO_COOKIE)} />
    </div>
  );
}
