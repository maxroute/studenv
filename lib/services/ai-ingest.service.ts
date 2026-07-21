import { YoutubeTranscript } from 'youtube-transcript';
import { PDFParse } from 'pdf-parse';

export async function fetchYouTubeTranscript(url: string): Promise<string> {
  try {
    const transcriptArray = await YoutubeTranscript.fetchTranscript(url);
    if (!transcriptArray || transcriptArray.length === 0) {
      throw new Error("No transcript found for this video.");
    }
    
    // Combine text
    return transcriptArray.map(t => t.text).join(' ');
  } catch (error) {
    console.error("Error fetching YouTube transcript:", error);
    throw new Error("Failed to fetch YouTube transcript. The video might not have captions enabled.");
  }
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    return data.text;
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error("Failed to parse PDF document.");
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
}
