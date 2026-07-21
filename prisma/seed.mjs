import fs from "node:fs";
import path from "node:path";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

function loadEnvFile(filename) {
  const filePath = path.join(process.cwd(), filename);

  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env) || !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing. Add your real Postgres/Neon connection string to .env or .env.local before seeding.",
  );
}

const prisma = new PrismaClient();

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function main() {
  const email = "demo@studenv.app";
  const passwordHash = await hashPassword("DemoPass123!");

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: "Demo User",
      username: "demo-user",
      bio: "A seeded demo account for Second Brain.",
      passwordHash,
      plan: "free",
      emailVerified: new Date(),
    },
    create: {
      email,
      name: "Demo User",
      username: "demo-user",
      bio: "A seeded demo account for Second Brain.",
      passwordHash,
      plan: "free",
      emailVerified: new Date(),
    },
  });

  await prisma.item.deleteMany({ where: { userId: user.id } });
  await prisma.tag.deleteMany({ where: { userId: user.id } });

  const tagMap = new Map();
  for (const tag of [
    ["ai", "#f5a623"],
    ["research", "#4abfb5"],
    ["design", "#9b7fe8"],
    ["product", "#e05a4b"],
    ["notes", "#5abf7a"],
    ["learning", "#6ba3e0"],
  ]) {
    const created = await prisma.tag.create({
      data: {
        userId: user.id,
        name: tag[0],
        color: tag[1],
      },
    });
    tagMap.set(created.name, created.id);
  }

  const items = [
    {
      type: "article",
      title: "Operational habits that keep product teams shipping",
      url: "https://example.com/product-shipping",
      excerpt: "A field guide to maintaining velocity without sacrificing quality.",
      notes: "Steal the weekly review format and the problem framing prompts.",
      status: "reading",
      starred: true,
      tags: ["product", "research"],
    },
    {
      type: "pdf",
      title: "Applied knowledge systems for modern founders",
      url: "https://example.com/founder-systems.pdf",
      excerpt: "How to store, connect, and revisit knowledge under real pressure.",
      notes: "Great model for evergreen notes.",
      status: "unread",
      starred: false,
      tags: ["research", "learning"],
    },
    {
      type: "video",
      title: "Design critiques that improve product intuition",
      url: "https://example.com/design-critique",
      excerpt: "A breakdown of interface decisions, hierarchy, and feedback loops.",
      notes: "Use this as a template for future critique sessions.",
      status: "done",
      starred: true,
      tags: ["design", "product"],
    },
    {
      type: "note",
      title: "Prompt patterns for extracting insight from articles",
      url: null,
      excerpt: "Questions to ask after every save so reading turns into usable knowledge.",
      notes: "What changed my mind? What deserves a permanent note?",
      status: "reading",
      starred: false,
      tags: ["notes", "ai"],
    },
    {
      type: "article",
      title: "The case for fewer dashboards and better defaults",
      url: "https://example.com/better-defaults",
      excerpt: "Interfaces get calmer when the product makes stronger choices.",
      notes: "Important for onboarding and empty states.",
      status: "done",
      starred: false,
      tags: ["design", "product"],
    },
    {
      type: "pdf",
      title: "Research library maintenance checklist",
      url: "https://example.com/library-checklist.pdf",
      excerpt: "Keep your saved knowledge searchable and trustworthy.",
      notes: "Archive duplicates. Rewrite vague titles.",
      status: "unread",
      starred: false,
      tags: ["research", "notes"],
    },
    {
      type: "video",
      title: "AI workflows for summarizing and synthesizing reading",
      url: "https://example.com/ai-workflows",
      excerpt: "A practical walkthrough of prompt loops and memory systems.",
      notes: "Good ideas for future pro features.",
      status: "reading",
      starred: true,
      tags: ["ai", "learning"],
    },
    {
      type: "note",
      title: "Launch checklist for Second Brain",
      url: null,
      excerpt: "Infra, verification, rate limits, analytics, and support handoff.",
      notes: "Turn this into a real operations document before launch.",
      status: "done",
      starred: true,
      tags: ["product", "notes"],
    },
  ];

  for (const item of items) {
    await prisma.item.create({
      data: {
        userId: user.id,
        type: item.type,
        title: item.title,
        url: item.url ?? null,
        excerpt: item.excerpt,
        notes: item.notes,
        status: item.status,
        starred: item.starred,
        sourceHost: item.url ? new URL(item.url).hostname : null,
        itemTags: {
          create: item.tags.map((tag) => ({
            tagId: tagMap.get(tag),
          })),
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
