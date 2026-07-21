/**
 * Seed (or reset) a hardcoded test account into the database.
 *
 * Credentials:
 *   Email:    test@secondbrain.dev
 *   Password: Test1234!
 *
 * Usage:
 *   node scripts/seed-test-user.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const EMAIL = "test@secondbrain.dev";
const PASSWORD = "Test1234!";
const NAME = "Test User";
const USERNAME = "testuser";

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

function resolveDatabaseUrl() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");

  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is missing. Add your Postgres connection string to .env or .env.local.",
    );
  }

  const url = new URL(connectionString);
  // Neon + Windows can fail when channel_binding=require is present.
  url.searchParams.delete("channel_binding");
  return url.toString();
}

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: resolveDatabaseUrl(),
      },
    },
  });

  try {
    const normalizedEmail = EMAIL.toLowerCase();
    const passwordHash = await hashPassword(PASSWORD);
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    let user;
    let operation = "updated";

    if (existing) {
      // Always reset password/login state so this account is deterministic.
      user = await prisma.user.update({
        where: { email: normalizedEmail },
        data: {
          name: NAME,
          passwordHash,
          plan: "pro",
          emailVerified: new Date(),
          loginAttempts: 0,
          lockedUntil: null,
        },
      });
    } else {
      operation = "created";
      const usernameOwner = await prisma.user.findUnique({
        where: { username: USERNAME },
        select: { id: true },
      });
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: NAME,
          username: usernameOwner ? null : USERNAME,
          passwordHash,
          plan: "pro",
          emailVerified: new Date(),
          loginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    console.log(`OK: Test user ${operation} successfully.`);
    console.log(`   ID:       ${user.id}`);
    console.log(`   Email:    ${normalizedEmail}`);
    console.log(`   Password: ${PASSWORD}`);
    console.log(`   Username: ${user.username ?? "(none)"}`);
    console.log(`   Plan:     ${user.plan}`);
  } catch (error) {
    console.error("ERROR: Failed to seed test user:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
