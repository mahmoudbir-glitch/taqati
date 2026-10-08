"use client";

import { useEffect, useMemo, useState } from "react";

type Telemetry = {
  id: string;
  recordedAt: string;
  solarPowerW: number | null;
  loadPowerW: number | null;
  gridPowerW: number | null;
  batterySoc: number | null;
  batteryPowerW: number | null;
  inverterStatus: string;
};

const demo: Telemetry = {
  id: "demo",
  recordedAt: new Date().toISOString(),
  solarPowerW: 4820,
  loadPowerW: 2310,
  gridPowerW: 0,
  batterySoc: 78,
  batteryPowerW: 1420,
  inverterStatus: "ONLINE",
};

export default function HomePage() {
  const [latest, setLatest] = useState<Telemetry>(demo);
  const [live, setLive] = useState(false);

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

  const stats = useMemo(() => [
    ["الطاقة الشمسية", `${((latest.solarPowerW ?? 0) / 1000).toFixed(2)} kW`, "إنتاج الآن"],
    ["البطارية", `${Math.round(latest.batterySoc ?? 0)}%`, "حالة الشحن"],
    ["استهلاك المنزل", `${((latest.loadPowerW ?? 0) / 1000).toFixed(2)} kW`, "حمل حالي"],
    ["الشبكة", `${Math.round(latest.gridPowerW ?? 0)} W`, "استيراد / تصدير"],
  ] as const, [latest]);

  return (
    <main className="container" style={{ paddingBlock: 28 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 28 }}>
        <div>
          <p style={{ color: "var(--accent)", margin: 0 }}>TAQATI</p>
          <h1 style={{ margin: "6px 0 0", fontSize: "clamp(28px, 6vw, 42px)" }}>منظومتك تحت السيطرة</h1>
        </div>
        <span className="card" style={{ padding: "10px 14px", color: live ? "var(--accent)" : "var(--muted)" }}>
          {live ? "● مباشر" : "تجريبي"}
        </span>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>منظومة طاقتي</h2>
            <p style={{ color: "var(--muted)", marginBottom: 0 }}>البيانات من Gateway عبر MQTT</p>
          </div>
          <strong style={{ color: latest.inverterStatus === "ONLINE" ? "var(--accent)" : "#f0b" }}>
            {latest.inverterStatus === "ONLINE" ? "● الإنفرتر متصل" : "● الإنفرتر غير متصل"}
          </strong>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        {stats.map(([label, value, hint]) => (
          <article className="card" key={label}>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>{label}</p>
            <strong style={{ display: "block", fontSize: 28 }}>{value}</strong>
            <small style={{ color: "var(--muted)" }}>{hint}</small>
          </article>
        ))}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>آخر قراءة</p>
        <strong>{new Date(latest.recordedAt).toLocaleString("ar-LB")}</strong>
      </section>
    </main>
  );
}
