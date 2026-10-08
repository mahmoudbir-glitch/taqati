"use client";

import { BatteryCharging, Bell, Cpu, LayoutDashboard, Settings, Sun, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { DataMode } from "../lib/types";
import { useTelemetry } from "./telemetry-provider";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV: readonly NavItem[] = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/energy", label: "الطاقة", icon: Zap },
  { href: "/battery", label: "البطارية", icon: BatteryCharging },
  { href: "/alerts", label: "التنبيهات", icon: Bell },
  { href: "/devices", label: "الأجهزة", icon: Cpu },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

// The phone bar has room for five; settings stays reachable from the top bar.
const BOTTOM_NAV = NAV.filter((item) => item.href !== "/settings");

const MODE_LABEL: Record<DataMode, string> = {
  live: "مباشر",
  demo: "بيانات تجريبية",
  error: "غير متصل",
};

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <Link href="/" className="brand" aria-label="طاقتي — الرئيسية">
      <span className="brand-mark">
        <Sun size={20} aria-hidden />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="brand-name" style={{ display: "block" }}>طاقتي</span>
        <span className="brand-sub" style={{ display: "block" }}>{subtitle}</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { mode, ready, attentionCount, settings } = useTelemetry();

  const badge = (href: string) =>
    href === "/alerts" && attentionCount > 0 ? (
      <span className="count-badge" aria-label={`${attentionCount} تنبيهات تحتاج انتباهك`}>{attentionCount}</span>
    ) : null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand subtitle="TAQATI" />
        <nav aria-label="التنقل الرئيسي">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon size={20} aria-hidden />
              {label}
              {badge(href)}
            </Link>
          ))}
        </nav>
        <p className="sidebar-foot">مراقبة منظومة الطاقة الشمسية</p>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="container topbar-inner">
            <Brand subtitle={settings.siteName} />
            <span className="topbar-spacer" />
            {ready && (
              <span className="mode-badge" data-mode={mode}>
                <span className={mode === "live" ? "dot pulse" : "dot"} />
                {MODE_LABEL[mode]}
              </span>
            )}
            <Link href="/alerts" className="icon-button" aria-label="التنبيهات">
              <Bell size={20} aria-hidden />
              {badge("/alerts")}
            </Link>
            <Link href="/settings" className="icon-button settings-link" aria-label="الإعدادات">
              <Settings size={20} aria-hidden />
            </Link>
          </div>
        </header>
        <div className="container">{children}</div>
      </div>

      <nav className="bottom-nav" aria-label="التنقل السفلي">
        {BOTTOM_NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isActive(pathname, href) ? "page" : undefined}>
            <Icon size={22} aria-hidden />
            {label}
            {badge(href)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
