import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";
import { AppIntro } from "@/components/intro/app-intro";
import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth/auth.config";
import { REQUEST_PATH_HEADER, signInPageFor } from "@/lib/auth/signed-in-redirect";

export default async function AuthenticatedLayout({
  children,
}: PropsWithChildren) {
  const session = await auth();

  if (!session?.user) {
    redirect(signInPageFor(headers().get(REQUEST_PATH_HEADER)));
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
      <AppIntro />
    </AppShell>
  );
}
