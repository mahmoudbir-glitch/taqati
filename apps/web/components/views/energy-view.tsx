"use client";

import { BatteryMedium, CalendarX, SunMedium, UtilityPole, Zap } from "lucide-react";
import { useState } from "react";
import { selfSufficiency, sumTotals } from "../../lib/energy";
import { dayLabel, kw, kwh, percent, shortDayLabel, startOfDay } from "../../lib/format";
import type { EnergyTotals } from "../../lib/types";
import { BarChart, TimeChart } from "../charts";
import { useTelemetry } from "../telemetry-provider";
import { DataGate, EmptyState, Legend, Ltr, Meter, PageHeader, Segmented, StatTile } from "../ui";

type Period = "today" | "week" | "month";

const PERIODS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: "today", label: "اليوم" },
  { value: "week", label: "7 أيام" },
  { value: "month", label: "30 يومًا" },
];

const PERIOD_DAYS: Record<Exclude<Period, "today">, number> = { week: 7, month: 30 };

const kwTick = (watts: number) => String(Number((watts / 1000).toFixed(2)));
const kwhTick = (wh: number) => String(Number((wh / 1000).toFixed(1)));

function Totals({ totals }: { totals: EnergyTotals }) {
  const sufficiency = selfSufficiency(totals);
  return (
    <>
      <div className="tiles">
        <StatTile label="الإنتاج الشمسي" value={kwh(totals.solarWh)} icon={SunMedium} color="var(--solar)" />
        <StatTile label="الاستهلاك" value={kwh(totals.loadWh)} icon={Zap} color="var(--home)" />
        <StatTile label="من الشبكة" value={kwh(totals.gridImportWh)} icon={UtilityPole} color="var(--grid)" />
        <StatTile label="من البطارية" value={kwh(totals.batteryDischargeWh)} icon={BatteryMedium} color="var(--battery)" />
      </div>
      <section className="card">
        <div className="card-head">
          <h2 className="card-title">الاكتفاء الذاتي</h2>
          <strong>
            <Ltr>{sufficiency === null ? "—" : percent(sufficiency)}</Ltr>
          </strong>
        </div>
        <Meter value={sufficiency ?? 0} color="var(--accent)" label="نسبة الاكتفاء الذاتي" />
        <p className="card-sub" style={{ marginTop: 8 }}>
          نسبة الاستهلاك التي غطّتها الشمس والبطارية دون الشبكة. شحن البطارية <Ltr>{kwh(totals.batteryChargeWh)}</Ltr> وتفريغها{" "}
          <Ltr>{kwh(totals.batteryDischargeWh)}</Ltr>.
        </p>
      </section>
    </>
  );
}

export function EnergyView() {
  const { today, todayTotals, daily, now } = useTelemetry();
  const [period, setPeriod] = useState<Period>("today");

  return (
    <main className="page">
      <PageHeader title="الطاقة" subtitle="الإنتاج والاستهلاك ومصادر التغذية">
        <Segmented label="الفترة" options={PERIODS} value={period} onChange={setPeriod} />
      </PageHeader>
      <DataGate>
        {() => {
          if (period === "today") {
            const dayStart = startOfDay(now);
            return (
              <>
                <Totals totals={todayTotals} />
                <section className="card">
                  <div className="card-head">
                    <div>
                      <h2 className="card-title">منحنى القدرة اليوم</h2>
                      <span className="card-sub">القدرة بالكيلوواط (kW)</span>
                    </div>
                    <Legend
                      items={[
                        { label: "الشمس", color: "var(--solar)" },
                        { label: "المنزل", color: "var(--home)" },
                        { label: "الشبكة", color: "var(--grid)" },
                      ]}
                    />
                  </div>
                  <TimeChart
                    label="القدرة الشمسية واستهلاك المنزل والسحب من الشبكة خلال اليوم"
                    start={dayStart}
                    end={dayStart + 24 * 3_600_000}
                    height={280}
                    formatValue={kw}
                    formatTick={kwTick}
                    series={[
                      { key: "solar", label: "الشمس", color: "var(--solar)", area: true, points: today.map((r) => ({ at: r.at, value: r.solarW })) },
                      { key: "home", label: "المنزل", color: "var(--home)", points: today.map((r) => ({ at: r.at, value: r.loadW })) },
                      { key: "grid", label: "الشبكة", color: "var(--grid)", points: today.map((r) => ({ at: r.at, value: Math.max(r.gridW, 0) })) },
                    ]}
                  />
                </section>
              </>
            );
          }

          if (!daily || daily.length === 0) {
            return (
              <EmptyState
                icon={CalendarX}
                title="لا توجد بيانات يومية"
                message="لم يُرجع الخادم مجاميع يومية لهذا الموقع. تأكد من أن خادم طاقتي محدَّث وأن القراءات تصل منذ أكثر من يوم."
              />
            );
          }

          const days = daily.slice(-PERIOD_DAYS[period]);
          return (
            <>
              <Totals totals={sumTotals(days)} />
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2 className="card-title">الإنتاج والاستهلاك اليومي</h2>
                    <span className="card-sub">الطاقة بالكيلوواط ساعة (kWh)</span>
                  </div>
                  <Legend items={[{ label: "الإنتاج", color: "var(--solar)" }, { label: "الاستهلاك", color: "var(--home)" }]} />
                </div>
                <BarChart
                  label="الإنتاج الشمسي والاستهلاك لكل يوم"
                  height={280}
                  formatValue={kwh}
                  formatTick={kwhTick}
                  categories={days.map((day) => ({ key: day.date, short: shortDayLabel(day.date), full: dayLabel(day.date) }))}
                  series={[
                    { key: "solar", label: "الإنتاج", color: "var(--solar)", values: days.map((day) => day.solarWh) },
                    { key: "load", label: "الاستهلاك", color: "var(--home)", values: days.map((day) => day.loadWh) },
                  ]}
                />
              </section>
              <section className="card">
                <div className="card-head">
                  <h2 className="card-title">تفاصيل الأيام</h2>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">اليوم</th>
                        <th scope="col">الإنتاج</th>
                        <th scope="col">الاستهلاك</th>
                        <th scope="col">من الشبكة</th>
                        <th scope="col">الاكتفاء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...days].reverse().map((day) => {
                        const sufficiency = selfSufficiency(day);
                        return (
                          <tr key={day.date}>
                            <th scope="row">{dayLabel(day.date)}</th>
                            <td><Ltr>{kwh(day.solarWh)}</Ltr></td>
                            <td><Ltr>{kwh(day.loadWh)}</Ltr></td>
                            <td><Ltr>{kwh(day.gridImportWh)}</Ltr></td>
                            <td><Ltr>{sufficiency === null ? "—" : percent(sufficiency)}</Ltr></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          );
        }}
      </DataGate>
    </main>
  );
}
