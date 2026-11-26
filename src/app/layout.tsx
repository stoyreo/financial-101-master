import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import "./globals.css";
import "@/styles/responsive-fold.css";
import { Providers } from "./providers";
import SyncStatusBar from "@/components/SyncStatusBar";
import PwaManager from "@/components/pwa/PwaManager";
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

// Single viewport meta (Next also injects a default one when none is exported, which
// previously produced a duplicate). Zoom stays enabled. theme-color matches the manifest
// theme_color so the installed titlebar / Android task bar is consistent.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#0B1330",
};

export const metadata: Metadata = {
  title: "Financial 101 Master crafted by Toy",
  description: "Thailand personal financial planning",
  applicationName: "Financial 101",
  // Safari 17+ "Add to Dock" / iOS "Add to Home Screen": Next emits
  // apple-mobile-web-app-capable, -title, -status-bar-style and mobile-web-app-capable.
  appleWebApp: { capable: true, title: "Financial 101", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  other: { "mobile-web-app-capable": "yes" },
  icons: {
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <AiStatusProvider>
          <AiSnapshotProvider>
            <Providers>{children}</Providers>
            <AutoSync />
            <SyncStatusBar />
            <GlobalAiAvatar />
            <PwaManager />
          </AiSnapshotProvider>
        </AiStatusProvider>
      </body>
    </html>
  );
}
