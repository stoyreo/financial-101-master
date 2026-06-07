import type { Metadata } from "next";
import dynamic from "next/dynamic";
import "./globals.css";
import { Providers } from "./providers";
import SyncStatusBar from "@/components/SyncStatusBar";
import { AiStatusProvider } from "@/lib/ai-status";
import { AiSnapshotProvider } from "@/lib/ai-snapshot-context";

// AutoSync uses browser-only APIs (localStorage via getSession, store subscribe),
// so render it client-side only.
const AutoSync = dynamic(() => import("@/components/AutoSync"), { ssr: false });

// GlobalAiAvatar drags/throws across the live DOM, polls session state, and
// reads the Zustand store — all browser-only, so render it client-side only
// (matches the AutoSync pattern). One avatar, mounted once, available on
// every page in the app.
const GlobalAiAvatar = dynamic(() => import("@/components/ai/GlobalAiAvatar"), { ssr: false });

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
          <AiSnapshotProvider>
            <Providers>{children}</Providers>
            <AutoSync />
            <SyncStatusBar />
            <GlobalAiAvatar />
          </AiSnapshotProvider>
        </AiStatusProvider>
      </body>
    </html>
  );
}
