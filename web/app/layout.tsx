import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { ServiceWorkerRegistration } from "@/components/shared/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kitchen Command Center",
  description: "Manage your kitchen inventory, recipes, meal plans, and grocery lists",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KCC",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
