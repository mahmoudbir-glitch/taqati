import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell";
import { TelemetryProvider } from "../components/telemetry-provider";
import { SETTINGS_KEY } from "../lib/settings";
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

// Applies a saved light/dark choice before first paint to avoid a theme flash.
const themeScript = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}));if(s&&(s.theme==="light"||s.theme==="dark"))document.documentElement.setAttribute("data-theme",s.theme)}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <TelemetryProvider>
          <AppShell>{children}</AppShell>
        </TelemetryProvider>
      </body>
    </html>
  );
}
