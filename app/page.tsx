import { auth } from "@/lib/auth/auth.config";
import LandingPage from "@/components/layout/landing-page";

export default async function HomePage() {
  const session = await auth();
  return <LandingPage session={session} />;
}

