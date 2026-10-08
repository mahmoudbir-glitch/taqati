"use client";

import { ArrowDownToLine, ArrowUpFromLine, Gauge } from "lucide-react";
import { batteryState, batteryStateLabel, LOW_SOC } from "../../lib/energy";
import { amps, kw, kwh, percent, power, startOfDay, volts } from "../../lib/format";
import { TimeChart } from "../charts";
import { useTelemetry } from "../telemetry-provider";
import { DataGate, Legend, Ltr, PageHeader, StatTile } from "../ui";

const RING_RADIUS = 84;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function BatteryView() {
  const { today, todayTotals, now } = useTelemetry();

  return (
    <main className="page">
      <PageHeader title="البطارية" subtitle="مستوى الشحن والجهد والتيار" />
      <DataGate>
        {(latest) => {
          const state = batteryState(latest);
          const soc = latest.soc;
          const low = soc !== null && soc <= LOW_SOC;
          const ringColor = low ? "var(--critical)" : "var(--battery)";
          const socValues = today.flatMap((reading) => (reading.soc === null ? [] : [reading.soc]));
          const dayStart = startOfDay(now);

          return (
            <>
              <div className="grid-2">
                <section className="card ring-wrap">
                  <svg className="ring" viewBox="0 0 200 200" role="img" aria-label={soc === null ? "مستوى الشحن غير متاح" : `مستوى الشحن ${Math.round(soc)} بالمئة`}>
                    <circle cx="100" cy="100" r={RING_RADIUS} fill="none" stroke={ringColor} strokeOpacity={0.18} strokeWidth="14" />
                    {soc !== null && (
                      <circle
                        cx="100"
                        cy="100"
                        r={RING_RADIUS}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth="14"
                        strokeLinecap="round"
                        strokeDasharray={`${(Math.min(Math.max(soc, 0), 100) / 100) * RING_LENGTH} ${RING_LENGTH}`}
                        transform="rotate(-90 100 100)"
                      />
                    )}
                    <text x="100" y="104" textAnchor="middle" fontSize="44" fontWeight="700" fill="var(--foreground)" direction="ltr">
                      {soc === null ? "—" : percent(soc)}
                    </text>
                    <text x="100" y="130" textAnchor="middle" fontSize="14" fill="var(--muted)">{batteryStateLabel[state]}</text>
                  </svg>
                  <p className="card-sub">
                    {low
                      ? `شحن البطارية منخفض (${LOW_SOC}% أو أقل)`
                      : state === "charging"
                        ? "البطارية تشحن الآن"
                        : state === "discharging"
                          ? "البطارية تغذي المنزل الآن"
                          : "لا يوجد شحن أو تفريغ يُذكر الآن"}
                  </p>
                </section>

                <section className="card">
                  <div className="card-head">
                    <h2 className="card-title">بيانات البطارية</h2>
                  </div>
                  <dl className="kv">
                    <div><dt>الحالة</dt><dd>{batteryStateLabel[state]}</dd></div>
                    <div><dt>القدرة</dt><dd><Ltr>{power(latest.batteryW)}</Ltr></dd></div>
                    <div><dt>الجهد</dt><dd><Ltr>{latest.batteryV === null ? "—" : volts(latest.batteryV)}</Ltr></dd></div>
                    <div><dt>التيار</dt><dd><Ltr>{latest.batteryA === null ? "—" : amps(latest.batteryA)}</Ltr></dd></div>
                  </dl>
                </section>
              </div>

              <div className="tiles tiles-3">
                <StatTile label="شُحن اليوم" value={kwh(todayTotals.batteryChargeWh)} icon={ArrowDownToLine} color="var(--battery)" />
                <StatTile label="فُرّغ اليوم" value={kwh(todayTotals.batteryDischargeWh)} icon={ArrowUpFromLine} color="var(--home)" />
                <StatTile
                  label="أدنى / أعلى شحن اليوم"
                  value={socValues.length > 1 ? `${Math.round(Math.min(...socValues))}% – ${Math.round(Math.max(...socValues))}%` : "—"}
                  icon={Gauge}
                  color="var(--battery)"
                />
              </div>

              {socValues.length > 1 ? (
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2 className="card-title">مستوى الشحن اليوم</h2>
                    <span className="card-sub">نسبة الشحن (%)</span>
                  </div>
                </div>
                <TimeChart
                  label="نسبة شحن البطارية خلال اليوم"
                  start={dayStart}
                  end={dayStart + 24 * 3_600_000}
                  yMax={100}
                  formatValue={percent}
                  formatTick={(value) => String(Math.round(value))}
                  reference={{ value: LOW_SOC, label: "مستوى التنبيه" }}
                  series={[
                    {
                      key: "soc",
                      label: "الشحن",
                      color: "var(--battery)",
                      area: true,
                      points: today.flatMap((reading) => (reading.soc === null ? [] : [{ at: reading.at, value: reading.soc }])),
                    },
                  ]}
                />
              </section>
              ) : (
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2 className="card-title">شحن وتفريغ البطارية اليوم</h2>
                    <span className="card-sub">القدرة بالكيلوواط (kW) — المصدر لا يحتفظ بسجل لنسبة الشحن</span>
                  </div>
                  <Legend items={[{ label: "شحن", color: "var(--battery)" }, { label: "تفريغ", color: "var(--home)" }]} />
                </div>
                <TimeChart
                  label="قدرة شحن البطارية وتفريغها خلال اليوم"
                  start={dayStart}
                  end={dayStart + 24 * 3_600_000}
                  formatValue={kw}
                  formatTick={(watts) => String(Number((watts / 1000).toFixed(2)))}
                  series={[
                    { key: "charge", label: "شحن", color: "var(--battery)", area: true, points: today.map((reading) => ({ at: reading.at, value: Math.max(reading.batteryW, 0) })) },
                    { key: "discharge", label: "تفريغ", color: "var(--home)", points: today.map((reading) => ({ at: reading.at, value: Math.max(-reading.batteryW, 0) })) },
                  ]}
                />
              </section>
              )}
            </>
          );
        }}
      </DataGate>
    </main>
  );
}
