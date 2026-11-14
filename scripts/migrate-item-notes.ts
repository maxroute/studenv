/**
 * Moves Shelf notes (Item.type = note) into Notes (design doc §1.6, path A).
 *
 *   npx tsx scripts/migrate-item-notes.ts                    # dry run: read-only report
 *   npx tsx scripts/migrate-item-notes.ts --apply --confirm-host=<host shown by the dry run>
 *
 * - Creates one Note per note item that has none, with Item.notes converted to
 *   a document and a `migration` revision. Item.notes is left untouched, so
 *   rolling back is deleting the Note rows it created.
 * - Idempotent: items that already have a Note are skipped.
 * - Batches of 200, each in its own transaction.
 * - Annotations on PDFs, videos and articles are not migrated (§9 Q1).
 *
 * WRITES TO THE DATABASE with --apply (CLAUDE.md §11). It connects to whatever
 * DATABASE_URL resolves to (Prisma also reads .env), so it prints the redacted
 * host and refuses to write unless --confirm-host matches it.
 */
import { prisma } from "@/lib/db/prisma";
import { createNoteForItem } from "@/lib/services/note.service";

const BATCH = 200;
const LEGACY_NOTES_LIMIT = 50_000;

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

  const pending = await prisma.item.findMany({
    where: { type: "note", note: { is: null } },
    select: { id: true, userId: true, title: true, notes: true },
    orderBy: { id: "asc" },
  });
  const empty = pending.filter((item) => !item.notes?.trim()).length;
  const long = pending.filter((item) => (item.notes?.length ?? 0) > LEGACY_NOTES_LIMIT).length;
  const alreadyMigrated = await prisma.item.count({ where: { type: "note", note: { isNot: null } } });

  console.log(`Note items to migrate: ${pending.length} (empty: ${empty}, over ${LEGACY_NOTES_LIMIT} chars: ${long})`);
  console.log(`Already migrated (skipped): ${alreadyMigrated}`);
  console.log(`Users affected: ${new Set(pending.map((item) => item.userId)).size}`);
  if (!apply) return;

  let created = 0;
  for (let start = 0; start < pending.length; start += BATCH) {
    const batch = pending.slice(start, start + BATCH);
    await prisma.$transaction(
      async (tx) => {
        for (const item of batch) {
          const before = await tx.note.count({ where: { itemId: item.id } });
          await createNoteForItem(item.userId, item, { reason: "migration", db: tx });
          if (before === 0) created += 1;
        }
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
    console.log(`Batch ${start / BATCH + 1}: ${batch.length} items`);
  }
  console.log(`Created ${created} notes.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "***") : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
