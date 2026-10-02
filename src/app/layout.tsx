import type { Metadata, Viewport } from "next";
import { Google_Sans } from "next/font/google";
import { PwaProvider } from "@/components/luna/pwa-provider";
import "./globals.css";

const googleSans = Google_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  fallback: ["system-ui", "-apple-system", "sans-serif"],
  adjustFontFallback: false,
});

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://luna.chat"),
  title: "Luna — Late-Night Anonymous Chat",
  description:
    "A quiet late-night sanctuary for honest, encrypted conversations with strangers under the moon.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Luna",
  },
  openGraph: {
    title: "Luna — Late-Night Anonymous Chat",
    description: "A quiet late-night sanctuary for honest, encrypted conversations with strangers under the moon.",
    url: "https://luna.chat",
    siteName: "Luna",
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "Luna — Late-Night Anonymous Chat",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Luna — Late-Night Anonymous Chat",
    description: "A quiet late-night sanctuary for honest, encrypted conversations with strangers under the moon.",
    images: ["/og.jpg"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${googleSans.variable} font-sans`}>
      <body className="antialiased min-h-dvh bg-[#09090b] text-[#fafafa] font-sans selection:bg-white/20 selection:text-white">
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
