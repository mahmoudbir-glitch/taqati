"use client";

import { useEffect, useMemo, useState } from "react";

type Telemetry = {
  id: string;
  recordedAt: string;
  solarPowerW: number | string | null;
  loadPowerW: number | string | null;
  gridPowerW: number | string | null;
  batterySoc: number | string | null;
  batteryVoltage?: number | string | null;
  batteryCurrent?: number | string | null;
  batteryPowerW: number | string | null;
  gridVoltage?: number | string | null;
  inverterStatus: string;
};

// Prisma Decimal columns are serialized as strings by the API.
const num = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const demo: Telemetry = {
  id: "demo",
  recordedAt: "",
  solarPowerW: 4820,
  loadPowerW: 2310,
  gridPowerW: 0,
  batterySoc: 78,
  batteryVoltage: 52.4,
  batteryCurrent: 27,
  batteryPowerW: 1420,
  gridVoltage: 230,
  inverterStatus: "ONLINE",
};

const THRESHOLD = 50; // watts below which a flow is considered idle

// <bdi dir="ltr"> keeps "1.23 kW" in that order inside the RTL layout.
const Ltr = ({ children }: { children: React.ReactNode }) => <bdi dir="ltr">{children}</bdi>;
const kw = (w: number) => `${(Math.abs(w) / 1000).toFixed(2)} kW`;

type Node = { key: string; label: string; value: string; sub?: string; color: string; x: number; y: number; icon: string };

export default function HomePage() {
  const [latest, setLatest] = useState<Telemetry>(demo);
  const [live, setLive] = useState(false);
  const [lastRead, setLastRead] = useState("—");

  const apiBase = process.env.NEXT_PUBLIC_TAQATI_API_URL;
  const siteId = process.env.NEXT_PUBLIC_TAQATI_SITE_ID;

  useEffect(() => {
    if (!apiBase || !siteId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/sites/${siteId}/telemetry/latest?limit=1`, { cache: "no-store" });
        if (!response.ok) throw new Error("telemetry request failed");
        const rows = (await response.json()) as Telemetry[];
        if (!cancelled && rows[0]) {
          setLatest(rows[0]);
          setLive(true);
        }
      } catch {
        if (!cancelled) setLive(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiBase, siteId]);

  // Formatted after mount so server and client render the same initial HTML.
  useEffect(() => {
    const date = latest.recordedAt ? new Date(latest.recordedAt) : null;
    setLastRead(date && !Number.isNaN(date.getTime()) ? date.toLocaleString("ar-LB") : "بيانات تجريبية");
  }, [latest.recordedAt]);

  const view = useMemo(() => {
    const solar = num(latest.solarPowerW);
    const load = num(latest.loadPowerW);
    const grid = num(latest.gridPowerW);
    const batt = num(latest.batteryPowerW);
    const soc = Math.round(num(latest.batterySoc));
    const gridV = num(latest.gridVoltage);
    const battA = Math.abs(num(latest.batteryCurrent));
    const gridA = gridV > 0 ? Math.abs(grid) / gridV : 0;
    const loadA = gridV > 0 ? load / gridV : 0;
    const charging = batt > THRESHOLD;
    const discharging = batt < -THRESHOLD;
    const importing = grid > THRESHOLD;
    const exporting = grid < -THRESHOLD;
    const online = latest.inverterStatus === "ONLINE";

    const mode = !online
      ? "الإنفرتر غير متصل"
      : importing && !(solar > THRESHOLD) && discharging
        ? "البطارية أولًا"
        : importing
          ? "الشبكة تغطي الحمل"
          : solar > THRESHOLD && exporting
            ? "الشمس أولًا • تصدير الفائض"
            : solar > THRESHOLD
              ? "الشمس أولًا"
              : discharging
                ? "البطارية تغطي الحمل"
                : "الوضع الحالي غير محدد";

    const nodes: Node[] = [
      { key: "solar", label: "الشمس", value: kw(solar), color: "#f59c00", x: 200, y: 60, icon: "☀" },
      { key: "grid", label: "الشبكة", value: importing || exporting ? kw(grid) : "غير مستخدمة", sub: gridA > 0.05 && (importing || exporting) ? `${gridA.toFixed(1)} A` : undefined, color: "#8548f2", x: 60, y: 200, icon: "⚡" },
      { key: "home", label: "المنزل", value: kw(load), sub: loadA > 0.05 ? `${loadA.toFixed(1)} A` : undefined, color: "#2f9bf5", x: 340, y: 200, icon: "⌂" },
      { key: "battery", label: charging ? "البطارية • تشحن" : discharging ? "البطارية • تفرغ" : "البطارية", value: `${soc}%`, sub: battA > 0.05 ? `${battA.toFixed(1)} A · ${kw(batt)}` : undefined, color: "#2ec27e", x: 200, y: 340, icon: "▮" },
    ];

    const spokes = [
      { key: "solar", active: solar > THRESHOLD, toHub: true, color: "#f59c00", d: "M200 96 L200 164" },
      { key: "grid", active: importing || exporting, toHub: !exporting, color: "#8548f2", d: exporting ? "M164 200 L100 200" : "M100 200 L164 200" },
      { key: "home", active: load > THRESHOLD, toHub: false, color: "#2f9bf5", d: "M236 200 L300 200" },
      { key: "battery", active: charging || discharging, toHub: discharging, color: "#2ec27e", d: charging ? "M200 164 L200 304" : "M200 304 L200 164" },
    ];

    return { nodes, spokes, mode, online, soc, charging, discharging };
  }, [latest]);

  const stats: ReadonlyArray<readonly [string, string, string]> = [
    ["الطاقة الشمسية", kw(num(latest.solarPowerW)), "إنتاج الآن"],
    ["استهلاك المنزل", kw(num(latest.loadPowerW)), "حمل حالي"],
    ["البطارية", `${view.soc}%`, view.charging ? "تشحن" : view.discharging ? "تفرغ" : "ثابتة"],
    ["الشبكة", `${Math.round(Math.abs(num(latest.gridPowerW)))} W`, num(latest.gridPowerW) < -THRESHOLD ? "تصدير" : num(latest.gridPowerW) > THRESHOLD ? "استيراد" : "غير مستخدمة"],
  ];

  return (
    <main className="container" style={{ paddingBlock: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div>
          <p style={{ color: "var(--accent)", margin: 0, fontSize: 13 }}>TAQATI · طاقتي</p>
          <h1 style={{ margin: "4px 0 0", fontSize: "clamp(22px, 6vw, 34px)" }}>منظومتك تحت السيطرة</h1>
        </div>
        <span className="card" style={{ padding: "8px 12px", color: live ? "var(--accent)" : "var(--muted)", whiteSpace: "nowrap" }}>
          {live ? "● مباشر" : "تجريبي"}
        </span>
      </header>

      <section className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <strong style={{ color: view.online ? "var(--accent)" : "#f0b" }}>{view.online ? "● الإنفرتر متصل" : "● الإنفرتر غير متصل"}</strong>
          <span style={{ color: "var(--muted)", fontSize: 14 }}>{view.mode}</span>
        </div>

        <svg viewBox="0 0 400 400" role="img" aria-label="مخطط تدفق الطاقة" style={{ width: "100%", maxWidth: 460, display: "block", margin: "8px auto 0" }}>
          {view.spokes.map((s) => (
            <path
              key={s.key}
              d={s.d}
              stroke={s.active ? s.color : "#2a4538"}
              strokeWidth={s.active ? 3 : 2}
              strokeDasharray={s.active ? "6 5" : "2 6"}
              fill="none"
            >
              {s.active && <animate attributeName="stroke-dashoffset" from="22" to="0" dur="1s" repeatCount="indefinite" />}
            </path>
          ))}
          <circle cx="200" cy="200" r="34" fill="#0d1b15" stroke="var(--accent)" strokeWidth="2" />
          <text x="200" y="206" textAnchor="middle" fill="var(--accent)" fontSize="13">إنفرتر</text>
          {view.nodes.map((n) => (
            <g key={n.key}>
              <circle cx={n.x} cy={n.y} r="34" fill="#0d1b15" stroke={n.color} strokeWidth="2.5" />
              <text x={n.x} y={n.y + 8} textAnchor="middle" fontSize="22" fill={n.color}>{n.icon}</text>
              <text x={n.x} y={n.y + (n.key === "battery" ? 58 : n.key === "solar" ? -44 : 56)} textAnchor="middle" fontSize="12" fill="var(--muted)">{n.label}</text>
              <text x={n.x} y={n.y + (n.key === "battery" ? 76 : n.key === "solar" ? -62 : 74)} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--foreground)">{n.value}</text>
              {n.sub && <text x={n.x} y={n.y + (n.key === "battery" ? 92 : n.key === "solar" ? -78 : 90)} textAnchor="middle" fontSize="11" fill="var(--muted)">{n.sub}</text>}
            </g>
          ))}
        </svg>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {stats.map(([label, value, hint]) => (
          <article className="card" key={label} style={{ padding: 14 }}>
            <p style={{ color: "var(--muted)", margin: 0, fontSize: 13 }}>{label}</p>
            <strong style={{ display: "block", fontSize: 22, margin: "4px 0" }}><Ltr>{value}</Ltr></strong>
            <small style={{ color: "var(--muted)" }}>{hint}</small>
          </article>
        ))}
      </section>

      <section className="card" style={{ marginTop: 10, padding: 14 }}>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: 13 }}>آخر قراءة</p>
        <strong>{lastRead}</strong>
      </section>
    </main>
  );
}
