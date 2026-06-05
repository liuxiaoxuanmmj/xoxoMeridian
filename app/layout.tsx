import type { Metadata } from "next";
import localFont from "next/font/local";

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

export const metadata: Metadata = {
  title: "XOXO Meridian",
  description: "A private two-person long-distance chat room with a local life assistant."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
