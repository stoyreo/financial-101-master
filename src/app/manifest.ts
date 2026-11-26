import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Makes Financial 101 Master installable on Android
// (Chrome / Samsung Internet "Install app"), macOS Chrome/Edge, and works on Galaxy Z Fold
// cover + inner screens.
const SHORTCUT_ICONS = [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }];

// Fields newer than Next's bundled MetadataRoute.Manifest typing.
type ManifestExtras = {
  screenshots?: { src: string; sizes: string; type: string; form_factor: "wide" | "narrow"; label: string }[];
  display_override?: string[];
  launch_handler?: { client_mode: string | string[] };
};

export default function manifest(): MetadataRoute.Manifest {
  const m: MetadataRoute.Manifest & ManifestExtras = {
    id: "/",
    name: "Financial 101 Master",
    short_name: "Financial 101",
    description: "Thailand personal financial planning",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // window-controls-overlay is intentionally NOT used: the desktop sidebar starts at the
    // very top-left, where the macOS traffic lights would overlap it.
    display_override: ["standalone", "minimal-ui"],
    launch_handler: { client_mode: "navigate-existing" },
    orientation: "any",
    background_color: "#0B1330",
    theme_color: "#0B1330",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Dashboard", url: "/", icons: SHORTCUT_ICONS },
      { name: "Income", url: "/income", icons: SHORTCUT_ICONS },
      { name: "Expenses", url: "/expenses", icons: SHORTCUT_ICONS },
      { name: "Tax", url: "/tax", icons: SHORTCUT_ICONS },
      { name: "Forecast", url: "/forecast", icons: SHORTCUT_ICONS },
    ],
    // Login page only (no user data). Enables the rich install dialog in Chrome / Edge.
    screenshots: [
      { src: "/screenshots/desktop-wide.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Sign in to Financial 101 Master" },
      { src: "/screenshots/mobile-narrow.png", sizes: "412x915", type: "image/png", form_factor: "narrow", label: "Sign in on your phone or Galaxy Z Fold" },
    ],
  };
  return m;
}
