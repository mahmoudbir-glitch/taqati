"use client";

import { Check, CircleCheck, History } from "lucide-react";
import { useState } from "react";
import { clockTime, relativeTime } from "../../lib/format";
import type { AlertSeverity } from "../../lib/types";
import { useTelemetry } from "../telemetry-provider";
import { DataGate, PageHeader, Segmented, SEVERITY_ICON, SeverityBadge } from "../ui";

type Filter = "all" | AlertSeverity;

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "critical", label: "حرج" },
  { value: "warning", label: "تحذير" },
  { value: "info", label: "معلومة" },
];

export function AlertsView() {
  const { alerts, events, ackedIds, acknowledge, now, mode } = useTelemetry();
  const [filter, setFilter] = useState<Filter>("all");

  const matches = (severity: AlertSeverity) => filter === "all" || filter === severity;
  const visibleAlerts = alerts.filter((alert) => matches(alert.severity));
  const visibleEvents = events.filter((event) => matches(event.severity));

  return (
    <main className="page">
      <PageHeader title="التنبيهات" subtitle="الحالات الجارية وسجل أحداث اليوم">
        <Segmented label="تصفية حسب الأهمية" options={FILTERS} value={filter} onChange={setFilter} />
      </PageHeader>
      <DataGate>
        {() => (
          <>
            <section className="card">
              <div className="card-head">
                <h2 className="card-title">التنبيهات الجارية</h2>
                <span className="card-sub">{visibleAlerts.length === 0 ? "لا شيء" : `${visibleAlerts.length} تنبيه`}</span>
              </div>
              {visibleAlerts.length === 0 ? (
                <p className="status-line" data-ok="true" style={{ fontWeight: 600 }}>
                  <CircleCheck size={18} aria-hidden />
                  {filter === "all" ? "المنظومة تعمل دون أي تنبيه جارٍ" : "لا توجد تنبيهات جارية بهذه الأهمية"}
                </p>
              ) : (
                <ul className="list">
                  {visibleAlerts.map((alert) => {
                    const Icon = SEVERITY_ICON[alert.severity];
                    const acked = ackedIds.includes(alert.id);
                    return (
                      <li key={alert.id} className="alert-item" data-severity={alert.severity} data-acked={acked}>
                        <span className="alert-icon">
                          <Icon size={18} aria-hidden />
                        </span>
                        <div className="alert-body">
                          <span className="alert-title">{alert.title}</span>
                          <span className="alert-message">{alert.message}</span>
                          <span className="alert-meta">
                            {mode === "demo" ? "بيانات تجريبية" : `حسب قراءة ${relativeTime(alert.at, now)}`}
                            {acked && " • تم الاطلاع"}
                          </span>
                        </div>
                        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                          <SeverityBadge severity={alert.severity} />
                          {!acked && (
                            <button type="button" className="button small" onClick={() => acknowledge(alert.id)}>
                              <Check size={14} aria-hidden />
                              تم الاطلاع
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h2 className="card-title">سجل اليوم</h2>
                <span className="card-sub">تغيّرات الحالة المستخرجة من القراءات</span>
              </div>
              {visibleEvents.length === 0 ? (
                <p className="muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <History size={18} aria-hidden />
                  لم تُسجَّل أحداث {filter === "all" ? "" : "بهذه الأهمية "}اليوم بعد.
                </p>
              ) : (
                <ol className="timeline">
                  {visibleEvents.map((event) => (
                    <li key={event.id} data-severity={event.severity}>
                      <time dateTime={new Date(event.at).toISOString()}>{clockTime(event.at)}</time>
                      <span className="dot" />
                      <span>{event.title}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </DataGate>
    </main>
  );
}
