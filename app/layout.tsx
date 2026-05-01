import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "XOXO Meridian",
  description: "A private two-person long-distance chat room with a local life assistant."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
