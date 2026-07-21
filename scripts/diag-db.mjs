const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  const itemCount = await prisma.item.count();
  const workspaceCount = await prisma.workspace.count();
  const assetCount = await prisma.mediaAsset.count();

  console.log({ userCount, itemCount, workspaceCount, assetCount });
  
  if (userCount > 0) {
    const user = await prisma.user.findFirst();
    console.log("First User ID:", user.id);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
