import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter_Tight } from "next/font/google";
import { baseUrl } from "@/lib/server/auth.ts";
import "./globals.css";

// next/font downloads the fonts at build time and serves them from this server: no third-party requests.
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display-face", display: "swap" });
const ui = Inter_Tight({ subsets: ["latin"], variable: "--font-ui-face", display: "swap" });

const DESCRIPTION = "Alle kommenden LARP-Veranstaltungen mit Anmeldelinks – filtern, merken, als Kalender abonnieren.";
const indexing = process.env.ALLOW_INDEXING === "true";

const metadata: Metadata = {
  title: { default: "LARP-Kalender", template: "%s – LARP-Kalender" },
  description: DESCRIPTION,
  robots: indexing ? { index: true, follow: true } : { index: false, follow: false, noarchive: true },
  openGraph: { type: "website", siteName: "LARP-Kalender", images: [{ url: "/icons/og-image.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image" },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/favicon.ico", sizes: "any" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "LARP-Kalender", statusBarStyle: "default" },
  alternates: { types: { "application/rss+xml": "/feed.xml", "text/calendar": "/kalender.ics" } },
};

/** metadataBase from PUBLIC_URL or the request, so Open Graph image URLs are absolute. */
export async function generateMetadata(): Promise<Metadata> {
  return { ...metadata, metadataBase: new URL(await baseUrl()) };
}

export const viewport: Viewport = { themeColor: "#15110e", width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Applies the stored colour scheme before the first paint (no flash of the wrong theme). */
const themeScript = `try{var t=JSON.parse(localStorage.getItem("lk.theme")||'"auto"');if(t!=="auto")document.documentElement.dataset.theme=t;var d=t==="dark"||(t==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches);document.querySelector('meta[name="theme-color"]').setAttribute("content",d?"#15110e":"#f5efe6")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${display.variable} ${ui.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
