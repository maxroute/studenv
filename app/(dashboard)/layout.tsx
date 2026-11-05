import React from "react";
import { auth } from "@/lib/auth/auth.config";
import { redirect } from "next/navigation";
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
    <DashboardLayoutClient>{children}</DashboardLayoutClient>
  );
}
