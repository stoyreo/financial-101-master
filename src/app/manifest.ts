import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Makes Financial 101 Master installable on Android
// (Chrome / Samsung Internet "Install app") and works on Galaxy Z Fold cover + inner screens.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Financial 101 Master",
    short_name: "Financial 101",
    description: "Thailand personal financial planning",
    start_url: "/",
    scope: "/",
    display: "standalone",
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
  };
}
