import type { Metadata, Viewport } from "next";
import { Google_Sans } from "next/font/google";
import { ServiceWorkerProvider } from "@/components/chat/service-worker-provider";
import "./globals.css";

const googleSans = Google_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600"],
  fallback: ["system-ui", "sans-serif"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#06070a" },
    { media: "(prefers-color-scheme: dark)", color: "#06070a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://luna.chat"),
  title: "Luna — Late-Night Anonymous Chat",
  description:
    "A quiet late-night sanctuary for honest, encrypted conversations with strangers under the moon.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
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
    <html lang="en" className={`dark ${googleSans.variable} font-sans`} suppressHydrationWarning>
      <body
        className="antialiased min-h-dvh bg-[#06070a] text-[#fafafa] font-sans selection:bg-indigo-500/25 selection:text-white"
        suppressHydrationWarning
      >
        <ServiceWorkerProvider>{children}</ServiceWorkerProvider>
      </body>
    </html>
  );
}
