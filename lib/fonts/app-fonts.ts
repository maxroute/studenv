// The app's fonts, served from ./files (Latin, from Google Fonts; SIL Open
// Font License). next/font/google downloads them during every build, and
// Google intermittently answers with a file address its loader cannot parse,
// which fails the build; local files make builds independent of Google and
// keep visitors from loading fonts from Google.
import localFont from "next/font/local";

/** Body text across the app (`--font-dm-sans`). */
export const dmSans = localFont({ src: "./files/dm-sans.woff2", weight: "100 1000", display: "swap", variable: "--font-dm-sans" });

/** Labels, counters and code (`--font-dm-mono`). */
export const dmMono = localFont({
  src: [
    { path: "./files/dm-mono-300.woff2", weight: "300", style: "normal" },
    { path: "./files/dm-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./files/dm-mono-500.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-dm-mono",
});

/** Display headings (`--font-fraunces`). */
export const fraunces = localFont({ src: "./files/fraunces.woff2", weight: "100 900", display: "swap", variable: "--font-fraunces" });

/** Dashboard text (`--font-instrument-sans`). */
export const instrumentSans = localFont({ src: "./files/instrument-sans.woff2", weight: "400 700", display: "swap", variable: "--font-instrument-sans" });

/** Dashboard display type (`--font-instrument-serif`). */
export const instrumentSerif = localFont({
  src: [
    { path: "./files/instrument-serif-normal.woff2", weight: "400", style: "normal" },
    { path: "./files/instrument-serif-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  variable: "--font-instrument-serif",
});

/** Handwriting on sticky notes and canvas text. */
export const patrickHand = localFont({ src: "./files/patrick-hand.woff2", weight: "400", display: "swap" });
