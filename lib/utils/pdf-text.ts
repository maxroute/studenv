// ---------------------------------------------------------------------------
// Per-page text of an uploaded PDF
// ---------------------------------------------------------------------------
//
// Pure: no pdf.js, database, network or React. The browser (after an upload)
// and the backfill script (on the server) both turn pdf.js text items into
// page text here and send it in batches small enough for one API request.

/** Pages read from one PDF; later pages are left without text. */
export const PDF_TEXT_MAX_PAGES = 1_000;
/** Characters kept per page; a page longer than this is cut. */
export const PDF_PAGE_TEXT_MAX_CHARS = 12_000;
/** Characters of page text per request (as JSON), well under the 100 KB request limit. */
export const PDF_TEXT_BATCH_MAX_CHARS = 60_000;
/** Pages per request. */
export const PDF_TEXT_BATCH_MAX_PAGES = 100;

export type PdfPageText = {
  pageNumber: number;
  width: number;
  height: number;
  /** "" when the page has no text layer (a scan); still saved so it is not read again. */
  text: string;
};

/**
 * Joins pdf.js text items into the page's text the way pdf.js's own find
 * does: items run together (pdf.js emits the spaces between words) with a
 * line break where it reports the end of a line. Runs of spaces are
 * collapsed and the text is cut at {@link PDF_PAGE_TEXT_MAX_CHARS}.
 *
 * `items` are pdf.js `getTextContent().items`: text items and marked-content markers.
 */
export function pageTextFromItems(items: readonly object[]): string {
  let text = "";
  for (const item of items) {
    // Marked-content items have no `str`.
    if (!("str" in item) || typeof item.str !== "string") continue;
    text += item.str;
    if ("hasEOL" in item && item.hasEOL === true) text += "\n";
  }
  const clean = text
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean.length > PDF_PAGE_TEXT_MAX_CHARS ? clean.slice(0, PDF_PAGE_TEXT_MAX_CHARS) : clean;
}

/** Number of pages to read from a PDF with `numPages` pages. */
export const pagesToRead = (numPages: number) => Math.max(0, Math.min(Math.floor(numPages) || 0, PDF_TEXT_MAX_PAGES));

/**
 * Groups pages, in order, into request-sized batches. A batch holds at most
 * {@link PDF_TEXT_BATCH_MAX_PAGES} pages and {@link PDF_TEXT_BATCH_MAX_CHARS}
 * characters of text, except that a single page is never split.
 */
export function batchPageTexts(pages: readonly PdfPageText[]): PdfPageText[][] {
  const batches: PdfPageText[][] = [];
  let current: PdfPageText[] = [];
  let chars = 0;
  for (const page of pages) {
    // Measured as JSON, so escaped quotes and line breaks count.
    const size = JSON.stringify(page.text).length;
    if (current.length > 0 && (current.length >= PDF_TEXT_BATCH_MAX_PAGES || chars + size > PDF_TEXT_BATCH_MAX_CHARS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(page);
    chars += size;
  }
  if (current.length) batches.push(current);
  return batches;
}
