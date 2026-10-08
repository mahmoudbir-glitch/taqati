"use client";

import { BatteryMedium, Cpu, Router, Sun, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { LOW_SOC, STALE_AFTER_MS } from "../../lib/energy";
import { amps, dateTime, percent, power, relativeTime, volts } from "../../lib/format";
import type { InverterStatus } from "../../lib/types";
import { useTelemetry } from "../telemetry-provider";
import { DataGate, Ltr, Meter, PageHeader } from "../ui";

const INVERTER_STATUS: Record<InverterStatus, { label: string; ok: boolean }> = {
  ONLINE: { label: "متصل", ok: true },
  OFFLINE: { label: "غير متصل", ok: false },
  FAULT: { label: "عطل", ok: false },
  UNKNOWN: { label: "غير معروف", ok: false },
};

function DeviceCard({
  icon: Icon,
  color,
  title,
  status,
  children,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  status: { label: string; ok: boolean };
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className="device-head">
        <span className="tile-icon" style={{ "--tone": color } as CSSProperties}>
          <Icon size={22} aria-hidden />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="card-title">{title}</h2>
          <span className="status-line" data-ok={status.ok} style={{ fontSize: 13 }}>
            <span className="dot" />
            {status.label}
          </span>
        </div>
      </div>
      {children}
    </section>
  );
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

export function DevicesView() {
  const { today, now, mode } = useTelemetry();

  return (
    <main className="page">
      <PageHeader title="الأجهزة" subtitle="حالة مكوّنات المنظومة حسب آخر قراءة" />
      <DataGate>
        {(latest) => {
          const demo = mode === "demo";
          const fresh = demo || now - latest.at <= STALE_AFTER_MS;
          const peakSolar = today.reduce((peak, reading) => Math.max(peak, reading.solarW), 0);
          const lastSeen = demo ? "بيانات تجريبية" : `${dateTime(latest.at)} (${relativeTime(latest.at, now)})`;

          return (
            <div className="grid-2">
              <DeviceCard icon={Cpu} color="var(--accent)" title="الإنفرتر" status={INVERTER_STATUS[latest.status]}>
                <dl className="kv">
                  <Row label="المعرّف"><Ltr>{latest.inverterId ?? "—"}</Ltr></Row>
                  <Row label="الحمل الحالي"><Ltr>{power(latest.loadW)}</Ltr></Row>
                  <Row label="جهد الشبكة"><Ltr>{latest.gridV === null ? "—" : volts(latest.gridV)}</Ltr></Row>
                  <Row label="تردد الشبكة"><Ltr>{latest.gridHz === null ? "—" : `${latest.gridHz.toFixed(1)} Hz`}</Ltr></Row>
                  <Row label="الحرارة"><Ltr>{latest.tempC === null ? "—" : `${Math.round(latest.tempC)} °C`}</Ltr></Row>
                </dl>
              </DeviceCard>

              <DeviceCard
                icon={Router}
                color="var(--info)"
                title="البوابة"
                status={fresh ? { label: "ترسل القراءات", ok: true } : { label: "متوقفة عن الإرسال", ok: false }}
              >
                <dl className="kv">
                  <Row label="المعرّف"><Ltr>{latest.gatewayId ?? "—"}</Ltr></Row>
                  <Row label="آخر قراءة">{lastSeen}</Row>
                  <Row label="مصدر البيانات">{demo ? "نموذج تجريبي داخل المتصفح" : "خادم طاقتي"}</Row>
                </dl>
              </DeviceCard>

              <DeviceCard
                icon={BatteryMedium}
                color="var(--battery)"
                title="البطارية"
                status={
                  latest.soc === null
                    ? { label: "لا توجد قراءة شحن", ok: false }
                    : latest.soc <= LOW_SOC
                      ? { label: "شحن منخفض", ok: false }
                      : { label: "سليمة", ok: true }
                }
              >
                <dl className="kv">
                  <Row label="مستوى الشحن"><Ltr>{latest.soc === null ? "—" : percent(latest.soc)}</Ltr></Row>
                  <Row label="الجهد"><Ltr>{latest.batteryV === null ? "—" : volts(latest.batteryV)}</Ltr></Row>
                  <Row label="التيار"><Ltr>{latest.batteryA === null ? "—" : amps(latest.batteryA)}</Ltr></Row>
                </dl>
                <div style={{ marginTop: 10 }}>
                  <Meter
                    value={latest.soc ?? 0}
                    color={latest.soc !== null && latest.soc <= LOW_SOC ? "var(--critical)" : "var(--battery)"}
                    label="مستوى شحن البطارية"
                  />
                </div>
              </DeviceCard>

              <DeviceCard
                icon={Sun}
                color="var(--solar)"
                title="الألواح الشمسية"
                status={latest.solarW > 50 ? { label: "تنتج الآن", ok: true } : { label: "لا يوجد إنتاج الآن", ok: true }}
              >
                <dl className="kv">
                  <Row label="الإنتاج الحالي"><Ltr>{power(latest.solarW)}</Ltr></Row>
                  <Row label="ذروة اليوم"><Ltr>{power(peakSolar)}</Ltr></Row>
                </dl>
              </DeviceCard>
            </div>
          );
        }}
      </DataGate>
    </main>
  );
}
