import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth/auth.config";

export default async function AuthenticatedLayout({
  children,
}: PropsWithChildren) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email,
        avatarUrl: session.user.avatarUrl,
        image: session.user.image,
      }}
    >
      {children}
    </AppShell>
  );
}
