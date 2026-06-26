import type { Metadata } from "next";
import localFont from "next/font/local";
import { Inter, Fira_Code, Lora, Caveat } from "next/font/google";

import "@/app/globals.css";

const poppins = localFont({
  src: [
    { path: "../public/fonts/poppins-regular.woff2", weight: "400" },
    { path: "../public/fonts/poppins-medium.woff2", weight: "500" },
    { path: "../public/fonts/poppins-semibold.woff2", weight: "600" },
    { path: "../public/fonts/poppins-bold.woff2", weight: "700" },
  ],
  display: "swap",
  variable: "--font-poppins",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fira-code",
});

const lora = Lora({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-lora",
});

const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-caveat",
});

export const metadata: Metadata = {
  title: "XOXO Meridian",
  description: "A private two-person long-distance chat room with a local life assistant."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${poppins.variable} ${inter.variable} ${firaCode.variable} ${lora.variable} ${caveat.variable}`}>
      <body>{children}</body>
    </html>
  );
}
