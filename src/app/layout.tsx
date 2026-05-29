import type { Metadata } from "next";
import dynamic from "next/dynamic";
import "./globals.css";
import { Providers } from "./providers";
import SyncStatusBar from "@/components/SyncStatusBar";
import { AiStatusProvider } from "@/lib/ai-status";

// AutoSync uses browser-only APIs (localStorage via getSession, store subscribe),
// so render it client-side only.
const AutoSync = dynamic(() => import("@/components/AutoSync"), { ssr: false });

export const metadata: Metadata = {
  title: "Financial 101 Master crafted by Toy",
  description: "Thailand personal financial planning",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />
      </head>
      <body suppressHydrationWarning style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <AiStatusProvider>
          <Providers>{children}</Providers>
          <AutoSync />
          <SyncStatusBar />
        </AiStatusProvider>
      </body>
    </html>
  );
}
