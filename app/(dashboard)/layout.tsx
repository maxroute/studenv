import React from "react";
import { AppIntro } from "@/components/intro/app-intro";
import { auth } from "@/lib/auth/auth.config";
import { redirect } from "next/navigation";
import { instrumentSans, instrumentSerif } from "@/lib/fonts/app-fonts";
import { DashboardSidebar } from "./DashboardSidebar";

import { DashboardLayoutClient } from "./DashboardLayoutClient";
// Groups' styles, loaded here so they are in the first HTML. Imported by the
// Groups page alone, they arrived after the loading screen, and on a slow phone
// connection the page showed as unstyled text until they loaded.
import "./dashboard/groups/study-groups.css";

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
      <AppIntro />
    </div>
  );
}
