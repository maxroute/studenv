/**
 * Saves per-page text (AssetPageManifest.searchText) for uploaded PDFs that
 * have none, so Rangan can search and summarize them. New uploads get their
 * text from the browser; this covers PDFs uploaded before that. Idempotent: a
 * PDF whose current revision already has page text is skipped, and a page
 * that already has text keeps it.
 *
 *   npx tsx --env-file=<env file> scripts/backfill-pdf-page-text.ts                 # dry run: lists PDFs only
 *   npx tsx --env-file=<env file> scripts/backfill-pdf-page-text.ts --owner=<userId> # one user's PDFs
 *   npx tsx --env-file=<env file> scripts/backfill-pdf-page-text.ts --apply --confirm-host=<host shown by the dry run>
 *
 * WRITES TO THE DATABASE with --apply (CLAUDE.md §11): it inserts page rows
 * and sets AssetRevision.pageCount. It reads each PDF from storage (S3/B2).
 * It prints the redacted database host and refuses to write unless
 * --confirm-host matches.
 */
import { prisma } from "@/lib/db/prisma";
import { listPdfAssetsWithoutPageText } from "@/lib/repositories/asset.repository";
import { extractTextFromRevision } from "@/lib/services/asset.service";

function redactedHost(url: string | undefined) {
  try {
    return new URL(url ?? "").hostname.replace(/^ep-[a-z0-9-]+?(-pooler)?\./, "ep-***$1.");
  } catch {
    return "unknown";
  }
}

const argValue = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const apply = process.argv.includes("--apply");
  const confirm = argValue("confirm-host");
  const ownerId = argValue("owner");
  const limit = Math.max(1, Number(argValue("limit")) || 500);
  const host = redactedHost(process.env.DATABASE_URL);
  console.log(`Target database host: ${host}`);
  console.log(apply ? "Mode: APPLY (writes)" : "Mode: dry run (read-only)");
  if (apply && confirm !== host) {
    console.error(`Refusing to write: pass --confirm-host=${host} to confirm this target.`);
    process.exitCode = 1;
    return;
  }

  const assets = await listPdfAssetsWithoutPageText({ ownerId, limit });
  console.log(`PDFs without page text${ownerId ? " for that user" : ""}: ${assets.length}`);
  for (const asset of assets) console.log(`  ${asset.id}  ${asset.title.slice(0, 60)}`);
  if (!apply) return;

  let done = 0;
  let failed = 0;
  for (const asset of assets) {
    try {
      const result = await extractTextFromRevision(asset.currentRevisionId);
      done += 1;
      console.log(`  ✓ ${asset.id}: ${result.pagesRead}/${result.pageCount} pages read, ${result.pagesWithText} with text`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ${asset.id}: ${message.replace(/postgres(ql)?:\/\/\S+/g, "***")}`);
    }
  }
  console.log(`Done: ${done} PDFs saved, ${failed} failed.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "***") : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
