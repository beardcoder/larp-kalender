import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LARP-Kalender",
    short_name: "LARP-Kalender",
    description: "Kommende LARP-Veranstaltungen mit Anmeldelinks",
    lang: "de",
    start_url: "/?source=pwa",
    scope: "/",
    id: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#15110e",
    theme_color: "#15110e",
    categories: ["entertainment", "lifestyle", "events"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Kalender", url: "/kalender", icons: [{ src: "/icons/shortcut-calendar.png", sizes: "96x96", type: "image/png" }] },
      { name: "Benachrichtigungen", url: "/benachrichtigungen", icons: [{ src: "/icons/shortcut-bell.png", sizes: "96x96", type: "image/png" }] },
      { name: "Merkliste", url: "/merkliste", icons: [{ src: "/icons/shortcut-bookmark.png", sizes: "96x96", type: "image/png" }] },
      { name: "Veranstaltung vorschlagen", url: "/vorschlagen", icons: [{ src: "/icons/shortcut-suggest.png", sizes: "96x96", type: "image/png" }] },
    ],
  };
}
