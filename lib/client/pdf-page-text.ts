"use client";

import { getClientPdfJs } from "@/lib/utils/pdf";
import { batchPageTexts, pagesToRead, pageTextFromItems, type PdfPageText } from "@/lib/utils/pdf-text";

// After a PDF is uploaded, the browser reads each page's text with the pdf.js
// it already uses to show PDFs, and saves it so Rangan can search and
// summarize the PDF. Reading on the server would download and parse the whole
// file inside one request, which a large PDF can outlast.

type TextPdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<{ items: object[] }>;
  cleanup: () => void;
};
type TextPdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<TextPdfPage>;
  destroy: () => Promise<void>;
};

const RATE_LIMIT_RETRIES = 3;

export const isPdfUpload = (contentType: string, filename: string) =>
  contentType === "application/pdf" || /\.pdf$/i.test(filename);

async function putBatch(assetId: string, body: string) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/pages`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (response.ok) return;
    if (response.status !== 429 || attempt >= RATE_LIMIT_RETRIES) {
      throw new Error(`Saving the PDF's text failed (${response.status}).`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
  }
}

/**
 * Reads `file`'s page text and saves it on `revisionId` of `assetId`.
 * Resolves with the number of pages saved; rejects when the PDF cannot be
 * read or saved (the upload itself is unaffected).
 */
export async function savePdfPageText(file: Blob, assetId: string, revisionId: string): Promise<number> {
  const pdfjs = await getClientPdfJs();
  if (!pdfjs) return 0;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf: TextPdfDocument = await pdfjs.getDocument({ data }).promise;
  try {
    const pages: PdfPageText[] = [];
    for (let pageNumber = 1; pageNumber <= pagesToRead(pdf.numPages); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { width, height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push({ pageNumber, width, height, text: pageTextFromItems(content.items) });
      page.cleanup();
    }
    for (const batch of batchPageTexts(pages)) {
      await putBatch(assetId, JSON.stringify({ revisionId, pageCount: pdf.numPages, pages: batch }));
    }
    return pages.length;
  } finally {
    await pdf.destroy();
  }
}
