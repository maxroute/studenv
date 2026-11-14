// ---------------------------------------------------------------------------
// Text colours and fonts a note can use
// ---------------------------------------------------------------------------
//
// Stored on the `textStyle` mark as CSS variables (`var(--note-color-red)`,
// `var(--note-font-lora)`), never as raw CSS: the editor writes these values
// straight into a `style` attribute, and font files are served under hashed
// names that change between builds. The variables are defined where notes
// render (notes.css and note-fonts.ts). Pure, so the save path can use it.

export const NOTE_TEXT_COLORS = [
  { key: "gray", label: "Gray" },
  { key: "brown", label: "Brown" },
  { key: "orange", label: "Orange" },
  { key: "yellow", label: "Yellow" },
  { key: "green", label: "Green" },
  { key: "teal", label: "Teal" },
  { key: "blue", label: "Blue" },
  { key: "purple", label: "Purple" },
  { key: "pink", label: "Pink" },
  { key: "red", label: "Red" },
] as const;

export const NOTE_FONTS = [
  { key: "inter", label: "Inter", sample: "Clean sans" },
  { key: "grotesk", label: "Space Grotesk", sample: "Modern sans" },
  { key: "nunito", label: "Nunito", sample: "Rounded sans" },
  { key: "lora", label: "Lora", sample: "Book serif" },
  { key: "merriweather", label: "Merriweather", sample: "Reading serif" },
  { key: "playfair", label: "Playfair Display", sample: "Elegant display" },
  { key: "slab", label: "Roboto Slab", sample: "Slab serif" },
  { key: "mono", label: "JetBrains Mono", sample: "Monospace" },
  { key: "caveat", label: "Caveat", sample: "Handwriting" },
  { key: "patrick", label: "Patrick Hand", sample: "Marker" },
] as const;

export const noteColorValue = (key: string) => `var(--note-color-${key})`;
export const noteFontValue = (key: string) => `var(--note-font-${key})`;

// Patterns, not the lists above, so a colour or font added by a newer build
// is kept by an older one instead of being stripped.
const COLOR_VALUE = /^(?:var\(--note-color-[a-z0-9-]{1,32}\)|#[0-9a-fA-F]{6})$/;
const FONT_VALUE = /^var\(--note-font-[a-z0-9-]{1,32}\)$/;

/** Keeps only safe colour / font values on a `textStyle` mark; anything else becomes null. */
export function coerceTextStyleAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  return {
    color: typeof attrs.color === "string" && COLOR_VALUE.test(attrs.color) ? attrs.color : null,
    fontFamily: typeof attrs.fontFamily === "string" && FONT_VALUE.test(attrs.fontFamily) ? attrs.fontFamily : null,
  };
}
