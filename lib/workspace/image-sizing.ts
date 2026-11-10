export interface ImageDisplaySize {
  w: number;
  h: number;
}

/**
 * Fit an image into a maximum canvas footprint without changing its intrinsic
 * aspect ratio. The image is scaled up or down to use the available footprint.
 */
export function fitImageToBounds(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth = 360,
  maxHeight = 240,
): ImageDisplaySize {
  if (
    !Number.isFinite(naturalWidth) || naturalWidth <= 0 ||
    !Number.isFinite(naturalHeight) || naturalHeight <= 0 ||
    !Number.isFinite(maxWidth) || maxWidth <= 0 ||
    !Number.isFinite(maxHeight) || maxHeight <= 0
  ) {
    return { w: 360, h: 240 };
  }

  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
  return {
    w: Math.max(1, Math.round(naturalWidth * scale)),
    h: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

/** Read the original dimensions before upload so imported images start at the
 * correct ratio instead of first appearing inside a generic landscape frame. */
export async function getImageDisplaySizeFromFile(file: File): Promise<ImageDisplaySize | null> {
  if (typeof createImageBitmap !== "function") return null;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      return fitImageToBounds(bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  } catch {
    // Some browsers cannot decode particular formats (for example HEIC).
    // ImageNode performs the same correction from the rendered image's
    // naturalWidth/naturalHeight when the browser can display it.
    return null;
  }
}
