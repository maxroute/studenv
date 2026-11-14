/**
 * Rebuilds the link index (ContentLink) from every note and every workspace's
 * latest snapshot. Idempotent: the table is derived data and can be rebuilt
 * at any time (design doc §3.3).
 *
 *   npx tsx scripts/rebuild-link-index.ts                    # dry run: counts only
 *   npx tsx scripts/rebuild-link-index.ts --apply --confirm-host=<host shown by the dry run>
 *
 * WRITES TO THE DATABASE with --apply (CLAUDE.md §11). Prisma also reads .env,
 * so it prints the redacted host and refuses to write unless --confirm-host matches.
 */
import { prisma } from "@/lib/db/prisma";
import { extractNoteRefs } from "@/lib/notes/extract-refs";
import { parseNoteDoc } from "@/lib/notes/note-format";
import { rebuildOwnerLinks } from "@/lib/services/link-index.service";

function redactedHost(url: string | undefined) {
  try {
    return new URL(url ?? "").hostname.replace(/^ep-[a-z0-9-]+?(-pooler)?\./, "ep-***$1.");
  } catch {
    return "unknown";
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirm = process.argv.find((arg) => arg.startsWith("--confirm-host="))?.split("=")[1];
  const host = redactedHost(process.env.DATABASE_URL);
  console.log(`Target database host: ${host}`);
  console.log(apply ? "Mode: APPLY (writes)" : "Mode: dry run (read-only)");
  if (apply && confirm !== host) {
    console.error(`Refusing to write: pass --confirm-host=${host} to confirm this target.`);
    process.exitCode = 1;
    return;
  }

  const owners = new Set<string>([
    ...(await prisma.note.findMany({ select: { ownerId: true }, distinct: ["ownerId"] })).map((row) => row.ownerId),
    ...(await prisma.workspace.findMany({ select: { ownerId: true }, distinct: ["ownerId"] })).map((row) => row.ownerId),
  ]);
  console.log(`Owners with notes or workspaces: ${owners.size}; current link rows: ${await prisma.contentLink.count()}`);
  if (!apply) return;

  let rows = 0;
  for (const ownerId of owners) {
    const result = await rebuildOwnerLinks(ownerId, (docJson) => extractNoteRefs(parseNoteDoc(docJson).envelope.doc));
    rows += result.rows;
  }
  console.log(`Rebuilt ${rows} link rows; table now has ${await prisma.contentLink.count()}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "***") : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
