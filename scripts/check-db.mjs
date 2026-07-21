import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator);
    const rawValue = trimmed.slice(separator + 1);
    env[key] = rawValue.replace(/^"(.*)"$/, "$1");
  }

  return env;
}

function resolveDatabaseUrl() {
  const cwd = process.cwd();
  const env = {
    ...readEnvFile(path.join(cwd, ".env")),
    ...readEnvFile(path.join(cwd, ".env.local")),
    ...process.env,
  };
  const connectionString = env.DATABASE_URL || env.DIRECT_DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing.");
  }

  const url = new URL(connectionString);
  url.searchParams.delete("channel_binding");
  return url.toString();
}

async function main() {
  const connectionString = resolveDatabaseUrl();
  const sql = neon(connectionString);
  const [result] =
    await sql`select current_database() as database_name, current_user as current_user`;

  console.log("Database connection OK");
  console.log(`database=${result.database_name}`);
  console.log(`user=${result.current_user}`);
}

main().catch((error) => {
  console.error("Database connection failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
