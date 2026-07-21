import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

// Load env
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const sep = t.indexOf("=");
    if (sep === -1) continue;
    process.env[t.slice(0, sep)] = t.slice(sep + 1).replace(/^"(.*)"$/, "$1");
  }
}

// Node 22+ has built-in WebSocket, no need for the `ws` package!
neonConfig.webSocketConstructor = WebSocket;

const connStr = process.env.DATABASE_URL;
const url = new URL(connStr);
url.searchParams.delete("channel_binding");
url.searchParams.delete("pgbouncer");
const connectionString = url.toString();

console.log("Connecting via built-in WebSocket adapter...");
const pool = new Pool({ connectionString });
const adapter = new PrismaNeon(pool);
const prisma = new PrismaClient({ adapter });

try {
  const result = await prisma.$queryRawUnsafe("SELECT 1 as ok");
  console.log("Prisma WebSocket connection OK:", JSON.stringify(result));
  
  const userCount = await prisma.user.count();
  console.log("User count:", userCount);
  
  const users = await prisma.user.findMany({ take: 1, select: { id: true, createdAt: true } });
  console.log("Date test:", JSON.stringify(users));
  
  await prisma.$disconnect();
  await pool.end();
  console.log("ALL TESTS PASSED!");
} catch (e) {
  console.error("FAILED:", e.message);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
}
