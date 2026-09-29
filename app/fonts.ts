import { Playfair_Display, Source_Serif_4, Inter_Tight } from "next/font/google";

// Display face for the masthead and big headlines — the engraved broadsheet feel.
export const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

// Body / article text — warmer and more "newspaper" than Georgia.
export const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

// All the small uppercase labels: kickers, nav, tags, counts.
export const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
