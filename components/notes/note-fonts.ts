// The ten fonts a note can use (see lib/notes/text-styles.ts). Each defines a
// `--note-font-*` variable on the note view. Not preloaded: a font file is
// only downloaded once text on the page uses it.
//
// The files live in ./fonts (Latin, variable weights, from Google Fonts; SIL
// Open Font License / Apache 2.0) rather than coming from next/font/google:
// that downloads them during every build, and Google intermittently answers
// with a file address the loader cannot parse, which fails the build.
import localFont from "next/font/local";

const inter = localFont({ src: "./fonts/inter.woff2", weight: "100 900", display: "swap", preload: false, variable: "--note-font-inter" });
const grotesk = localFont({ src: "./fonts/grotesk.woff2", weight: "300 700", display: "swap", preload: false, variable: "--note-font-grotesk" });
const nunito = localFont({ src: "./fonts/nunito.woff2", weight: "200 1000", display: "swap", preload: false, variable: "--note-font-nunito" });
const lora = localFont({ src: "./fonts/lora.woff2", weight: "400 700", display: "swap", preload: false, variable: "--note-font-lora" });
const merriweather = localFont({
  src: [
    { path: "./fonts/merriweather-normal.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/merriweather-italic.woff2", weight: "400 700", style: "italic" },
  ],
  display: "swap",
  preload: false,
  variable: "--note-font-merriweather",
});
const playfair = localFont({ src: "./fonts/playfair.woff2", weight: "400 900", display: "swap", preload: false, variable: "--note-font-playfair" });
const slab = localFont({ src: "./fonts/slab.woff2", weight: "100 900", display: "swap", preload: false, variable: "--note-font-slab" });
const mono = localFont({ src: "./fonts/mono.woff2", weight: "100 800", display: "swap", preload: false, variable: "--note-font-mono" });
const caveat = localFont({ src: "./fonts/caveat.woff2", weight: "400 700", display: "swap", preload: false, variable: "--note-font-caveat" });
const patrick = localFont({ src: "./fonts/patrick.woff2", weight: "400", display: "swap", preload: false, variable: "--note-font-patrick" });

/** Class names that define every `--note-font-*` variable. */
export const noteFontVariables = [inter, grotesk, nunito, lora, merriweather, playfair, slab, mono, caveat, patrick]
  .map((font) => font.variable)
  .join(" ");
