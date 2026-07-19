import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppAnalytics from "@/components/AppAnalytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "豆阁",
  description: "以AI为笔，将千年纹样织入像素网格，化作可供触摸的豆粒诗篇。",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "豆阁",
  },
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png" },
    ],
    apple: [{ url: "/logo.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#111827",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} overflow-x-hidden bg-gray-50 text-gray-900 antialiased`}
      >
        {children}
        <AppAnalytics />
      </body>
    </html>
  );
}
