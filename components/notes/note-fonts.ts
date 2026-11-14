// The ten fonts a note can use (see lib/notes/text-styles.ts). Each defines a
// `--note-font-*` variable on the note view. Not preloaded: a font file is
// only downloaded once text on the page uses it.
import {
  Caveat, Inter, JetBrains_Mono, Lora, Merriweather, Nunito, Patrick_Hand, Playfair_Display, Roboto_Slab, Space_Grotesk,
} from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--note-font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false, variable: "--note-font-grotesk" });
const nunito = Nunito({ subsets: ["latin"], display: "swap", preload: false, variable: "--note-font-nunito" });
const lora = Lora({ subsets: ["latin"], display: "swap", preload: false, variable: "--note-font-lora" });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "swap", preload: false, variable: "--note-font-merriweather" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false, variable: "--note-font-playfair" });
const slab = Roboto_Slab({ subsets: ["latin"], display: "swap", preload: false, variable: "--note-font-slab" });
const mono = JetBrains_Mono({ subsets: ["latin"], display: "swap", preload: false, variable: "--note-font-mono" });
const caveat = Caveat({ subsets: ["latin"], display: "swap", preload: false, variable: "--note-font-caveat" });
const patrick = Patrick_Hand({ subsets: ["latin"], weight: "400", display: "swap", preload: false, variable: "--note-font-patrick" });

/** Class names that define every `--note-font-*` variable. */
export const noteFontVariables = [inter, grotesk, nunito, lora, merriweather, playfair, slab, mono, caveat, patrick]
  .map((font) => font.variable)
  .join(" ");
