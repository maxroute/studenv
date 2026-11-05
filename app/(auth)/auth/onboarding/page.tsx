import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth.config";
import { OnboardingContent } from "./OnboardingContent";

type OnboardingPageProps = {
  searchParams?: {
    email?: string | string[];
  };
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/auth/onboarding");
  }

  const emailParam = searchParams?.email;
  const initialEmail = typeof emailParam === "string" ? emailParam : null;

  return (
    <OnboardingContent
      initialProfile={{
        email: session.user.email ?? initialEmail ?? "",
        name: session.user.name ?? "",
        username: session.user.username ?? "",
        bio: session.user.bio ?? "",
        avatarUrl: session.user.avatarUrl ?? null,
        isEmailVerified: Boolean(session.user.isEmailVerified),
      }}
    />
  );
}
