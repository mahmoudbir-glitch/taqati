"use client";

import { CircleAlert, Info, ServerOff, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { AlertSeverity, Reading } from "../lib/types";
import { useTelemetry } from "./telemetry-provider";

// <bdi dir="ltr"> keeps "1.23 kW" in that order inside the RTL layout.
export const Ltr = ({ children }: { children: ReactNode }) => <bdi dir="ltr">{children}</bdi>;

const tone = (color: string) => ({ "--tone": color }) as CSSProperties;

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  icon: LucideIcon;
  color?: string;
}) {
  return (
    <article className="card tile">
      <div className="tile-top">
        <span className="tile-icon" style={color ? tone(color) : undefined}>
          <Icon size={18} aria-hidden />
        </span>
        {label}
      </div>
      {/* Numbers with Latin units read left to right; Arabic values keep the page direction. */}
      <strong className="tile-value">{/[؀-ۿ]/.test(value) ? value : <Ltr>{value}</Ltr>}</strong>
      {hint && <span className="tile-hint">{hint}</span>}
    </article>
  );
}

export const SEVERITY_LABEL: Record<AlertSeverity, string> = { critical: "حرج", warning: "تحذير", info: "معلومة" };
export const SEVERITY_ICON: Record<AlertSeverity, LucideIcon> = { critical: CircleAlert, warning: TriangleAlert, info: Info };

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const Icon = SEVERITY_ICON[severity];
  return (
    <span className="severity" data-severity={severity}>
      <Icon size={13} aria-hidden />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  children,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <section className="card empty">
      <span className="tile-icon">
        <Icon size={26} aria-hidden />
      </span>
      <h2>{title}</h2>
      <p>{message}</p>
      {children}
    </section>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: ReadonlyArray<{ label: string; color: string }> }) {
  return (
    <div className="legend">
      {items.map((item) => (
        <span key={item.label}>
          <i className="swatch" style={{ "--swatch": item.color } as CSSProperties} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function Meter({ value, color, label }: { value: number; color: string; label: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="meter" style={tone(color)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)}>
      <span style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function ConnectionBanner() {
  const { mode } = useTelemetry();
  if (mode !== "error") return null;
  return (
    <div className="banner" data-severity="critical" role="status">
      <ServerOff size={18} aria-hidden />
      <span>تعذّر الاتصال بخادم طاقتي. تُعرض آخر قراءات وصلت، وستُحدَّث تلقائيًا عند عودة الاتصال.</span>
    </div>
  );
}

/** Renders page content once a reading exists; otherwise a loading or empty state. */
export function DataGate({ children }: { children: (latest: Reading) => ReactNode }) {
  const { ready, latest, mode } = useTelemetry();

  if (!ready) {
    return (
      <div className="grid-2" aria-busy="true" aria-label="جارٍ التحميل">
        <div className="skeleton" style={{ height: 220 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  if (!latest) {
    return mode === "error" ? (
      <EmptyState icon={ServerOff} title="لا يمكن الوصول إلى الخادم" message="لم نتمكن من جلب أي قراءة من خادم طاقتي. تحقق من عنوان الخادم ومن أنه يعمل، وسنعيد المحاولة تلقائيًا.">
        <Link href="/settings" className="button">فتح الإعدادات</Link>
      </EmptyState>
    ) : (
      <EmptyState icon={Info} title="لا توجد قراءات بعد" message="الخادم متصل لكن لم تصل أي قراءة من البوابة لهذا الموقع حتى الآن.">
        <Link href="/devices" className="button">حالة الأجهزة</Link>
      </EmptyState>
    );
  }

  return (
    <>
      <ConnectionBanner />
      {children(latest)}
    </>
  );
}
