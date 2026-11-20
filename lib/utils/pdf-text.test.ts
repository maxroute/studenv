import assert from "node:assert/strict";
import test from "node:test";
import { PdfPageTextBatchSchema } from "@/lib/models/asset.model";
import {
  batchPageTexts,
  pagesToRead,
  pageTextFromItems,
  PDF_PAGE_TEXT_MAX_CHARS,
  PDF_TEXT_BATCH_MAX_CHARS,
  PDF_TEXT_BATCH_MAX_PAGES,
  PDF_TEXT_MAX_PAGES,
  type PdfPageText,
} from "./pdf-text";

const page = (pageNumber: number, text: string): PdfPageText => ({ pageNumber, width: 612, height: 792, text });

test("page text runs items together and breaks lines where pdf.js ends one", () => {
  const items = [
    { str: "Cell", hasEOL: false },
    { str: " ", hasEOL: false },
    { str: "biology", hasEOL: true },
    { type: "beginMarkedContent" },
    { str: "Mito", hasEOL: false },
    { str: "chondria  make   ATP", hasEOL: true },
    { type: "endMarkedContent" },
  ];
  assert.equal(pageTextFromItems(items), "Cell biology\nMitochondria make ATP");
});

test("page text trims, drops NUL characters and keeps at most one blank line", () => {
  const items = [
    { str: "  A\u0000", hasEOL: true },
    { str: "", hasEOL: true },
    { str: "", hasEOL: true },
    { str: "", hasEOL: true },
    { str: "B  ", hasEOL: true },
  ];
  assert.equal(pageTextFromItems(items), "A\n\nB");
});

test("a page with no text items has empty text", () => {
  assert.equal(pageTextFromItems([]), "");
  assert.equal(pageTextFromItems([{ type: "beginMarkedContent" }, { str: 42 }]), "");
});

test("very long page text is cut", () => {
  const text = pageTextFromItems([{ str: "x".repeat(PDF_PAGE_TEXT_MAX_CHARS + 500) }]);
  assert.equal(text.length, PDF_PAGE_TEXT_MAX_CHARS);
});

test("pages read are capped", () => {
  assert.equal(pagesToRead(12), 12);
  assert.equal(pagesToRead(PDF_TEXT_MAX_PAGES + 1), PDF_TEXT_MAX_PAGES);
  assert.equal(pagesToRead(0), 0);
  assert.equal(pagesToRead(Number.NaN), 0);
});

test("batches keep page order and stay under the page and size limits", () => {
  const pages = Array.from({ length: 250 }, (_, index) => page(index + 1, "word ".repeat(200).trim()));
  const batches = batchPageTexts(pages);
  assert.deepEqual(batches.flat().map((p) => p.pageNumber), pages.map((p) => p.pageNumber));
  for (const batch of batches) {
    assert.ok(batch.length <= PDF_TEXT_BATCH_MAX_PAGES);
    assert.ok(batch.reduce((sum, p) => sum + JSON.stringify(p.text).length, 0) <= PDF_TEXT_BATCH_MAX_CHARS);
  }
});

test("batches count escaped characters, and never split a page", () => {
  const quotes = '"'.repeat(PDF_PAGE_TEXT_MAX_CHARS);
  const batches = batchPageTexts([page(1, quotes), page(2, quotes), page(3, quotes)]);
  // Each page is ~24 000 characters as JSON, so two fit in one 60 000 batch, not three.
  assert.deepEqual(batches.map((batch) => batch.map((p) => p.pageNumber)), [[1, 2], [3]]);
  assert.deepEqual(batchPageTexts([]), []);
});

test("the largest batch fits the 100 KB request limit", () => {
  const pages = Array.from({ length: 10 }, (_, index) => page(index + 1, '"\n'.repeat(PDF_PAGE_TEXT_MAX_CHARS / 2)));
  for (const batch of batchPageTexts(pages)) {
    const body = JSON.stringify({ revisionId: "c".repeat(25), pageCount: 10, pages: batch });
    assert.ok(body.length <= 100 * 1024, `body is ${body.length} characters`);
  }
});

test("batch schema accepts a valid batch", () => {
  const parsed = PdfPageTextBatchSchema.safeParse({ revisionId: "rev1", pageCount: 3, pages: [page(1, "a"), page(3, "")] });
  assert.ok(parsed.success);
});

test("batch schema rejects pages past the end, repeated pages, and bad sizes", () => {
  const invalid = [
    { revisionId: "rev1", pageCount: 2, pages: [page(3, "a")] },
    { revisionId: "rev1", pageCount: 2, pages: [page(1, "a"), page(1, "b")] },
    { revisionId: "rev1", pageCount: 2, pages: [] },
    { revisionId: "rev1", pageCount: 2, pages: [{ ...page(1, "a"), width: 0 }] },
    { revisionId: "rev1", pageCount: 2, pages: [page(1, "x".repeat(PDF_PAGE_TEXT_MAX_CHARS + 1))] },
    { revisionId: "", pageCount: 2, pages: [page(1, "a")] },
  ];
  for (const body of invalid) assert.equal(PdfPageTextBatchSchema.safeParse(body).success, false);
});
