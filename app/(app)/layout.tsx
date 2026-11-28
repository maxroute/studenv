import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";
import { AppIntro } from "@/components/intro/app-intro";
import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/lib/auth/auth.config";
// The pages' own styles, loaded here so they are in the first HTML. Imported by
// the pages alone, they arrived with the page after the loading screen, and on a
// slow phone connection the page showed unstyled until they loaded.
import "@/components/library/library-screen.module.css";
import "@/components/notes/notes.css";

export default async function AuthenticatedLayout({
  children,
}: PropsWithChildren) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
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
