/** Profile photos are shown small, and the host refuses requests over about 4.5 MB. */
export const MAX_AVATAR_EDGE = 640;
export const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

/** The size that fits `edge` on its longer side, never larger than the original. */
export function fitWithin(width: number, height: number, edge = MAX_AVATAR_EDGE) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const toBlob = (canvas: HTMLCanvasElement, type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));

/** A smaller copy of a photo. GIFs (which may move) and anything the browser can't read are sent as they are. */
export async function shrinkImage(file: File): Promise<File> {
  if (file.type === "image/gif") return file;
  try {
    const image = await createImageBitmap(file);
    const size = fitWithin(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, size.width, size.height);
    image.close();
    // WebP keeps transparency. A browser that can't write it hands back a PNG instead.
    const blob = await toBlob(canvas, "image/webp");
    if (!blob || blob.size >= file.size) return file;
    const extension = blob.type === "image/webp" ? "webp" : "png";
    return new File([blob], `photo.${extension}`, { type: blob.type });
  } catch {
    return file;
  }
}
