import { auth } from "@/lib/auth/auth.config";
import { ensureDatabaseReady } from "@/lib/db/prisma";

export async function getServerSession() {
  return auth();
}

export async function requireAuth() {
  const session = await auth();

  if (!session?.user?.id) {
    const error = new Error("Authentication required.");
    Object.assign(error, { status: 401 });
    throw error;
  }

  // The session is a signed cookie and needs no database, so a cold database
  // would otherwise fail the first query of the page. Wake it here, once.
  await ensureDatabaseReady();

  return {
    ...session.user,
    plan: session.user.plan ?? "free",
    isEmailVerified: session.user.isEmailVerified ?? false,
  };
}

export async function requirePlan(plan: "free" | "pro" | "team") {
  const user = await requireAuth();
  const planRank = { free: 0, pro: 1, team: 2 } as const;

  if (planRank[user.plan] < planRank[plan]) {
    const error = new Error("Your plan does not allow this action.");
    Object.assign(error, { status: 403 });
    throw error;
  }

  return user;
}
