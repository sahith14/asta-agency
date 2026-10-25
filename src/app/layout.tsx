import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: {
    default: "AgencyOS — Websites and videos, delivered by one studio.",
    template: "%s · AgencyOS",
  },
  description:
    "AgencyOS designs and builds websites, web apps and e-commerce, and produces brand, food and property videos. Two creative divisions, one accountable team.",
  keywords: ["AgencyOS", "web agency", "video production", "websites", "brand videos"],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "AgencyOS — Websites and videos, delivered by one studio.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
