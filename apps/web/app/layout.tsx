import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell";
import { TelemetryProvider } from "../components/telemetry-provider";
import "./globals.css";

const sans = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "طاقتي | Taqati", template: "%s | طاقتي" },
  description: "منصة ذكية لمراقبة وإدارة أنظمة الطاقة الشمسية",
  applicationName: "طاقتي",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#dbeafe" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1726" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={sans.variable}>
      <body>
        <TelemetryProvider>
          <AppShell>{children}</AppShell>
        </TelemetryProvider>
      </body>
    </html>
  );
}
