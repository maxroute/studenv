import { Suspense } from "react";
import { auth } from "@/lib/auth/auth.config";
import { redirect } from "next/navigation";
import { LoginContent } from "./LoginContent";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await auth();

  if (session) {
    if (searchParams?.desktopSignIn === "true") {
      redirect("/auth/desktop-callback");
    } else {
      redirect("/dashboard");
    }
  }

  return (
    <Suspense fallback={<div className="simple-auth-page" />}>
      <LoginContent />
    </Suspense>
  );
}
