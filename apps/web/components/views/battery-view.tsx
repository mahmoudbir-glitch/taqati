"use client";

import { ArrowDownToLine, ArrowUpFromLine, Gauge, Hourglass, Plug, Zap } from "lucide-react";
import { batteryEstimate, batteryState, batteryStateLabel } from "../../lib/energy";
import { amps, duration, kwh, percent, power, startOfDay, volts } from "../../lib/format";
import { TimeChart } from "../charts";
import { useTelemetry } from "../telemetry-provider";
import { DataGate, Ltr, PageHeader, StatTile } from "../ui";

const RING_RADIUS = 84;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function BatteryView() {
  const { today, todayTotals, settings, now } = useTelemetry();

  return (
    <main className="page">
      <PageHeader title="البطارية" subtitle="مستوى الشحن والتيار والتوقعات" />
      <DataGate>
        {(latest) => {
          const state = batteryState(latest);
          const estimate = batteryEstimate(latest, settings);
          const soc = latest.soc;
          const atReserve = soc !== null && soc <= settings.reserveSoc;
          const ringColor = atReserve ? "var(--critical)" : "var(--battery)";
          const socValues = today.flatMap((reading) => (reading.soc === null ? [] : [reading.soc]));
          const storedWh = soc === null ? null : (soc / 100) * settings.batteryCapacityWh;
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
                    {estimate
                      ? estimate.target === "full"
                        ? `تمتلئ خلال ${duration(estimate.hours)} تقريبًا بالمعدل الحالي`
                        : `تصل إلى حد الاحتياط خلال ${duration(estimate.hours)} تقريبًا بالمعدل الحالي`
                      : atReserve
                        ? "البطارية عند حد الاحتياط"
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
                    <div><dt>الطاقة المخزّنة تقديريًا</dt><dd><Ltr>{storedWh === null ? "—" : kwh(storedWh)}</Ltr></dd></div>
                    <div><dt>السعة الكلية</dt><dd><Ltr>{kwh(settings.batteryCapacityWh)}</Ltr></dd></div>
                    <div><dt>حد الاحتياط</dt><dd><Ltr>{percent(settings.reserveSoc)}</Ltr></dd></div>
                  </dl>
                </section>
              </div>

              <div className="tiles">
                <StatTile label="شُحن اليوم" value={kwh(todayTotals.batteryChargeWh)} icon={ArrowDownToLine} color="var(--battery)" />
                <StatTile label="فُرّغ اليوم" value={kwh(todayTotals.batteryDischargeWh)} icon={ArrowUpFromLine} color="var(--home)" />
                <StatTile
                  label="أدنى / أعلى شحن اليوم"
                  value={socValues.length ? `${Math.round(Math.min(...socValues))}% – ${Math.round(Math.max(...socValues))}%` : "—"}
                  icon={Gauge}
                  color="var(--battery)"
                />
                <StatTile
                  label={estimate?.target === "full" ? "الوقت حتى الامتلاء" : "الوقت حتى الاحتياط"}
                  value={estimate ? duration(estimate.hours) : "—"}
                  hint={state === "charging" ? <><Plug size={13} aria-hidden /> تشحن الآن</> : state === "discharging" ? <><Zap size={13} aria-hidden /> تغذي المنزل</> : undefined}
                  icon={Hourglass}
                  color="var(--accent)"
                />
              </div>

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
                  reference={{ value: settings.reserveSoc, label: "حد الاحتياط" }}
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
            </>
          );
        }}
      </DataGate>
    </main>
  );
}
