import type { Metadata } from "next";
import localFont from "next/font/local";
import RetuneIfDev from "@/components/RetuneIfDev";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { APP_TITLE } from "@/lib/document-title";
import "./globals.css";

// Self-hosted so the build never fetches Google Fonts: next/font/google's
// build-time download failed intermittently ("next/font/google queries have
// exactly one entry") and took production deploys down with it. The files are
// the Latin subsets next/font/google served before, so Latin text renders
// unchanged.
// TODO(simplification): Latin only. next/font/google also lazy-loaded the
// latin-ext subset; letters from it (ž, ė: 2 of 1,055 Portfolio rows on
// 2026-10-22) now render in the fallback font (Arial, or Times New Roman for
// Fraunces). Upgrade path: add each family's latin-ext file as a second
// localFont with a unicode-range, listed before the Latin one in globals.css.
const inter = localFont({
  variable: "--font-inter",
  src: [{ path: "./fonts/inter-latin.woff2", weight: "100 900", style: "normal" }],
});

const oswald = localFont({
  variable: "--font-oswald",
  src: [{ path: "./fonts/oswald-latin.woff2", weight: "500 700", style: "normal" }],
});

const fraunces = localFont({
  variable: "--font-fraunces",
  src: [
    { path: "./fonts/fraunces-latin.woff2", weight: "300 400", style: "normal" },
    { path: "./fonts/fraunces-italic-latin.woff2", weight: "300 400", style: "italic" },
  ],
  adjustFontFallback: "Times New Roman",
});

const jetbrainsMono = localFont({
  variable: "--font-jetbrains",
  src: [{ path: "./fonts/jetbrains-mono-latin.woff2", weight: "400 500", style: "normal" }],
});

export const metadata: Metadata = {
  // Server-rendered default. page-client replaces it on mount with the open
  // company or the current view (see documentTitle), so this is what shows
  // for the frame before hydration.
  title: APP_TITLE,
  description: "Understory customer dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${oswald.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--page-bg)] text-[var(--moss)]">
        {children}
        <RetuneIfDev />
        <SpeedInsights />
      </body>
    </html>
  );
}
