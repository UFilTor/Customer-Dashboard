import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SessionWrapper from "@/components/SessionWrapper";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Customer Dashboard",
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
      className={`${inter.variable} h-full antialiased`}
      style={
        {
          "--color-primary": "#022C12",
          "--color-accent": "#F1F97E",
          "--color-background": "#FFFFFF",
          "--color-text": "#4D4D4D",
          "--radius-general": "16px",
          "--radius-button": "8px",
        } as React.CSSProperties
      }
    >
      <body
        className="min-h-full flex flex-col font-[var(--font-inter)]"
        style={{ backgroundColor: "var(--color-background)", color: "var(--color-text)" }}
      >
        <SessionWrapper>{children}</SessionWrapper>
      </body>
    </html>
  );
}
