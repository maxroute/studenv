import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const userCount = await prisma.user.count();
  const sessionCount = await prisma.session.count();
  const itemCount = await prisma.item.count();
  const focusSessionCount = await prisma.focusSession.count();
  console.log({ userCount, sessionCount, itemCount, focusSessionCount });
  
  const firstUser = await prisma.user.findFirst();
  if (firstUser) {
    console.log("Found user ID:", firstUser.id);
    
    // Warm up Prisma
    await prisma.user.findUnique({ where: { id: firstUser.id } });
    
    const startQueries = performance.now();
    const [user, focusSessions, recentItems, unreadCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: firstUser.id },
        select: { name: true, username: true, email: true, xp: true, streakDays: true }
      }),
      prisma.focusSession.aggregate({
        where: { userId: firstUser.id, status: "completed" },
        _sum: { durationMs: true }
      }),
      prisma.item.findMany({
        where: { userId: firstUser.id },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          type: true,
          createdAt: true,
          status: true
        }
      }),
      prisma.item.count({
        where: { userId: firstUser.id, status: { in: ["unread", "reading"] } }
      })
    ]);
    const endQueries = performance.now();
    console.log("Individual queries timing:", (endQueries - startQueries).toFixed(2), "ms");
    console.log("Query results:", { focusSessions, unreadCount });
  } else {
    console.log("No users found");
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
