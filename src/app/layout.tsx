import type { Metadata } from "next";
import { Geist, Geist_Mono, Syne, Space_Grotesk, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Public-site identity fonts — Syne for cinematic display type,
// Space Grotesk for readable body copy, Instrument Serif (italic) for
// editorial accent words. Scoped to the public site via `.site-scope`;
// the app/portal keep Geist.
const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Single-style editorial serif for accent words ("feel different.", etc.)
const instrumentSerif = Instrument_Serif({
  variable: "--font-editorial",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "ASTA AGENCY — Websites and videos, delivered by one studio.",
    template: "%s · ASTA AGENCY",
  },
  description:
    "ASTA AGENCY designs and builds websites, web apps and e-commerce, and produces brand, food and property videos. Two creative divisions, one accountable team.",
  keywords: ["ASTA AGENCY", "web agency", "video production", "websites", "brand videos"],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "ASTA AGENCY — Websites and videos, delivered by one studio.",
    description: "Website & digital services and video production & creative services, delivered by one accountable team.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} ${spaceGrotesk.variable} ${instrumentSerif.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
