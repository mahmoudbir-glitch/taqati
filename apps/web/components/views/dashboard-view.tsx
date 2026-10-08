"use client";

import { BatteryMedium, ChevronLeft, CircleCheck, House, PiggyBank, ShieldCheck, Sun, SunMedium, UtilityPole, Zap } from "lucide-react";
import Link from "next/link";
import { batteryState, batteryStateLabel, operatingMode, savings, selfSufficiency } from "../../lib/energy";
import { dateTime, kw, kwh, money, percent, power, relativeTime, startOfDay, THRESHOLD_W } from "../../lib/format";
import { TimeChart } from "../charts";
import { EnergyFlow } from "../energy-flow";
import { useTelemetry } from "../telemetry-provider";
import { DataGate, Legend, Ltr, PageHeader, SEVERITY_ICON, SeverityBadge, StatTile } from "../ui";

const kwTick = (watts: number) => String(Number((watts / 1000).toFixed(2)));

export function DashboardView() {
  const { today, todayTotals, alerts, ackedIds, settings, now, mode } = useTelemetry();

  return (
    <main className="page">
      <PageHeader title="منظومتك تحت السيطرة" subtitle={settings.siteName} />
      <DataGate>
        {(latest) => {
          const online = latest.status === "ONLINE";
          const sufficiency = selfSufficiency(todayTotals);
          const openAlerts = alerts.filter((alert) => !ackedIds.includes(alert.id));
          const dayStart = startOfDay(now);
          const gridHint = latest.gridW < -THRESHOLD_W ? "تصدير" : latest.gridW > THRESHOLD_W ? "استيراد" : "غير مستخدمة";

          return (
            <>
              <div className="grid-2 wide-first">
                <section className="card">
                  <div className="card-head">
                    <strong className="status-line" data-ok={online}>
                      <span className={online ? "dot pulse" : "dot"} />
                      {online ? "الإنفرتر متصل" : "الإنفرتر غير متصل"}
                    </strong>
                    <span className="card-sub">{operatingMode(latest)}</span>
                  </div>
                  <EnergyFlow reading={latest} />
                  <p className="card-sub" style={{ textAlign: "center", marginTop: 6 }}>
                    آخر قراءة: {mode === "demo" ? "بيانات تجريبية" : `${dateTime(latest.at)} (${relativeTime(latest.at, now)})`}
                  </p>
                </section>

                <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
                  <section className="tiles" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                    <StatTile label="الطاقة الشمسية" value={kw(latest.solarW)} hint="إنتاج الآن" icon={Sun} color="var(--solar)" />
                    <StatTile label="استهلاك المنزل" value={kw(latest.loadW)} hint="حمل حالي" icon={House} color="var(--home)" />
                    <StatTile
                      label="البطارية"
                      value={latest.soc === null ? "—" : percent(latest.soc)}
                      hint={batteryStateLabel[batteryState(latest)]}
                      icon={BatteryMedium}
                      color="var(--battery)"
                    />
                    <StatTile label="الشبكة" value={power(latest.gridW)} hint={gridHint} icon={UtilityPole} color="var(--grid)" />
                  </section>

                  <section className="card">
                    <div className="card-head">
                      <h2 className="card-title">التنبيهات</h2>
                      <Link href="/alerts" className="link">
                        عرض الكل
                        <ChevronLeft size={16} aria-hidden />
                      </Link>
                    </div>
                    {openAlerts.length === 0 ? (
                      <p className="status-line" data-ok="true" style={{ fontWeight: 600 }}>
                        <CircleCheck size={18} aria-hidden />
                        لا توجد تنبيهات تحتاج انتباهك
                      </p>
                    ) : (
                      <ul className="list">
                        {openAlerts.slice(0, 3).map((alert) => {
                          const Icon = SEVERITY_ICON[alert.severity];
                          return (
                            <li key={alert.id} className="alert-item" data-severity={alert.severity}>
                              <span className="alert-icon">
                                <Icon size={18} aria-hidden />
                              </span>
                              <div className="alert-body">
                                <span className="alert-title">{alert.title}</span>
                                <span className="alert-message">{alert.message}</span>
                              </div>
                              <SeverityBadge severity={alert.severity} />
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </div>
              </div>

              <section>
                <div className="card-head" style={{ marginTop: 6 }}>
                  <h2 className="card-title">ملخص اليوم</h2>
                  <Link href="/energy" className="link">
                    تفاصيل الطاقة
                    <ChevronLeft size={16} aria-hidden />
                  </Link>
                </div>
                <div className="tiles">
                  <StatTile label="إنتاج اليوم" value={kwh(todayTotals.solarWh)} icon={SunMedium} color="var(--solar)" />
                  <StatTile label="استهلاك اليوم" value={kwh(todayTotals.loadWh)} icon={Zap} color="var(--home)" />
                  <StatTile
                    label="الاكتفاء الذاتي"
                    value={sufficiency === null ? "—" : percent(sufficiency)}
                    hint="من الاستهلاك دون الشبكة"
                    icon={ShieldCheck}
                    color="var(--accent)"
                  />
                  <StatTile
                    label="توفير اليوم"
                    value={money(savings(todayTotals, settings.tariff), settings.currency)}
                    hint={<>بتعرفة <Ltr>{settings.tariff}</Ltr> لكل kWh</>}
                    icon={PiggyBank}
                    color="var(--accent)"
                  />
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <div>
                    <h2 className="card-title">الإنتاج والاستهلاك اليوم</h2>
                    <span className="card-sub">القدرة بالكيلوواط (kW)</span>
                  </div>
                  <Legend items={[{ label: "الشمس", color: "var(--solar)" }, { label: "المنزل", color: "var(--home)" }]} />
                </div>
                <TimeChart
                  label="القدرة الشمسية واستهلاك المنزل خلال اليوم"
                  start={dayStart}
                  end={dayStart + 24 * 3_600_000}
                  formatValue={kw}
                  formatTick={kwTick}
                  series={[
                    { key: "solar", label: "الشمس", color: "var(--solar)", area: true, points: today.map((r) => ({ at: r.at, value: r.solarW })) },
                    { key: "home", label: "المنزل", color: "var(--home)", points: today.map((r) => ({ at: r.at, value: r.loadW })) },
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
