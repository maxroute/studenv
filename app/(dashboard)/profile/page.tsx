import { auth } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import { ProfilePage } from "@/components/profile/profile-page";

export default async function ProfileRoute() {
  const session = await auth();

  // Fetch user profile server-side so the client never shows placeholder text.
  // The parent layout already guarantees an authenticated session, so
  // session.user.id is always available here.
  const dbUser = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          bio: true,
          avatarUrl: true,
          plan: true,
          emailVerified: true,
          createdAt: true,
        },
      })
    : null;

  // Build the initial user object matching the shape useUser expects
  // (PublicProfile & { createdAt?: string }).
  const initialUser = dbUser
    ? {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        username: dbUser.username,
        bio: dbUser.bio,
        avatarUrl: dbUser.avatarUrl,
        plan: dbUser.plan as "free" | "pro",
        emailVerified: dbUser.emailVerified,
        createdAt: dbUser.createdAt.toISOString(),
      }
    : undefined;

  return (
    <div className="min-h-full px-6 py-6 md:px-8 md:py-7 xl:px-10 xl:py-9">
      <div className="mx-auto w-full max-w-6xl">
        <ProfilePage initialUser={initialUser} />
      </div>
    </div>
  );
}
