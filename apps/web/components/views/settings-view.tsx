"use client";

import { CircleCheck, PlugZap, RotateCcw, Save, ServerOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { apiConfig, checkHealth } from "../../lib/api";
import { CURRENCIES } from "../../lib/settings";
import type { DataMode, Settings, ThemeChoice } from "../../lib/types";
import { useTelemetry } from "../telemetry-provider";
import { Ltr, PageHeader, Segmented } from "../ui";

const THEMES: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: "system", label: "حسب الجهاز" },
  { value: "light", label: "فاتح" },
  { value: "dark", label: "داكن" },
];

const MODE_TEXT: Record<DataMode, string> = {
  live: "متصل بخادم طاقتي ويعرض قراءات حية",
  demo: "لم يُضبط خادم؛ تُعرض بيانات تجريبية مولّدة داخل المتصفح",
  error: "الخادم مضبوط لكن تعذّر الوصول إليه",
};

type Draft = {
  siteName: string;
  currency: string;
  tariff: string;
  arrayKw: string;
  inverterKw: string;
  batteryKwh: string;
  reserveSoc: string;
};

const toDraft = (settings: Settings): Draft => ({
  siteName: settings.siteName,
  currency: settings.currency,
  tariff: String(settings.tariff),
  arrayKw: String(settings.arrayPowerW / 1000),
  inverterKw: String(settings.inverterPowerW / 1000),
  batteryKwh: String(settings.batteryCapacityWh / 1000),
  reserveSoc: String(settings.reserveSoc),
});

type NumberField = { key: Exclude<keyof Draft, "siteName" | "currency">; label: string; hint: string; min: number; max: number; step: number };

const NUMBER_FIELDS: readonly NumberField[] = [
  { key: "tariff", label: "تعرفة الكيلوواط ساعة", hint: "سعر kWh من الشبكة بالعملة المختارة؛ يُستخدم لحساب التوفير.", min: 0, max: 1_000_000, step: 0.01 },
  { key: "arrayKw", label: "قدرة الألواح (kW)", hint: "مجموع القدرة الاسمية للألواح المركّبة.", min: 0.1, max: 1000, step: 0.1 },
  { key: "inverterKw", label: "قدرة الإنفرتر (kW)", hint: "تُستخدم لحساب نسبة الحمل وتنبيه الحمل المرتفع.", min: 0.1, max: 1000, step: 0.1 },
  { key: "batteryKwh", label: "سعة البطارية (kWh)", hint: "تُستخدم لتقدير زمن الشحن والتفريغ.", min: 0.1, max: 10_000, step: 0.1 },
  { key: "reserveSoc", label: "حد احتياط البطارية (%)", hint: "تنبيه حرج عند الوصول إلى هذه النسبة أو دونها.", min: 0, max: 90, step: 1 },
];

function SettingsForm({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const { saveSettings } = useTelemetry();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [error, setError] = useState("");

  const set = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.siteName.trim()) {
      setError("اكتب اسمًا للموقع.");
      return;
    }
    for (const field of NUMBER_FIELDS) {
      const value = Number(draft[field.key]);
      if (draft[field.key].trim() === "" || !Number.isFinite(value) || value < field.min || value > field.max) {
        setError(`قيمة «${field.label}» يجب أن تكون بين ${field.min} و${field.max}.`);
        return;
      }
    }
    setError("");
    saveSettings({
      ...initial,
      siteName: draft.siteName,
      currency: draft.currency,
      tariff: Number(draft.tariff),
      arrayPowerW: Number(draft.arrayKw) * 1000,
      inverterPowerW: Number(draft.inverterKw) * 1000,
      batteryCapacityWh: Number(draft.batteryKwh) * 1000,
      reserveSoc: Number(draft.reserveSoc),
    });
    onSaved();
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="form two">
        <div className="field">
          <label htmlFor="siteName">اسم الموقع</label>
          <input id="siteName" className="input" maxLength={40} value={draft.siteName} onChange={(event) => set("siteName", event.target.value)} />
          <small>يظهر في أعلى التطبيق.</small>
        </div>
        <div className="field">
          <label htmlFor="currency">العملة</label>
          <select id="currency" className="input" value={draft.currency} onChange={(event) => set("currency", event.target.value)}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
          <small>عملة عرض التوفير.</small>
        </div>
        {NUMBER_FIELDS.map((field) => (
          <div className="field" key={field.key}>
            <label htmlFor={field.key}>{field.label}</label>
            <input
              id={field.key}
              className="input"
              type="number"
              inputMode="decimal"
              dir="ltr"
              lang="en"
              min={field.min}
              max={field.max}
              step={field.step}
              value={draft[field.key]}
              onChange={(event) => set(field.key, event.target.value)}
            />
            <small>{field.hint}</small>
          </div>
        ))}
      </div>
      {error && (
        <p className="banner" data-severity="critical" role="alert" style={{ marginTop: 14 }}>
          {error}
        </p>
      )}
      <div className="actions" style={{ marginTop: 16 }}>
        <button type="submit" className="button primary">
          <Save size={18} aria-hidden />
          حفظ الإعدادات
        </button>
      </div>
    </form>
  );
}

type TestState = "idle" | "testing" | "ok" | "failed";

export function SettingsView() {
  const { settings, saveSettings, resetSettings, mode, ready } = useTelemetry();
  const [savedAt, setSavedAt] = useState(0);
  const [test, setTest] = useState<TestState>("idle");

  const runTest = async () => {
    setTest("testing");
    try {
      setTest((await checkHealth()) ? "ok" : "failed");
    } catch {
      setTest("failed");
    }
  };

  const reset = () => {
    if (window.confirm("إعادة كل الإعدادات إلى قيمها الافتراضية؟")) {
      resetSettings();
      setSavedAt(0);
    }
  };

  return (
    <main className="page">
      <PageHeader title="الإعدادات" subtitle="بيانات الموقع والمنظومة والمظهر" />

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">الموقع والمنظومة</h2>
          {savedAt > 0 && (
            <span className="status-line" data-ok="true" role="status" style={{ fontSize: 14 }}>
              <CircleCheck size={16} aria-hidden />
              تم الحفظ
            </span>
          )}
        </div>
        {/* Remounts with the stored values once they load, after a save, and after a reset. */}
        <SettingsForm key={`${ready}-${JSON.stringify(settings)}`} initial={settings} onSaved={() => setSavedAt(Date.now())} />
        <p className="card-sub" style={{ marginTop: 12 }}>تُحفظ هذه الإعدادات في هذا المتصفح فقط.</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">المظهر</h2>
        </div>
        <Segmented label="المظهر" options={THEMES} value={settings.theme} onChange={(theme) => saveSettings({ ...settings, theme })} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">الاتصال بالخادم</h2>
        </div>
        <dl className="kv">
          <div><dt>الحالة</dt><dd>{ready ? MODE_TEXT[mode] : "…"}</dd></div>
          <div><dt>عنوان الخادم</dt><dd><Ltr>{apiConfig.apiBase || "—"}</Ltr></dd></div>
          <div><dt>معرّف الموقع</dt><dd><Ltr>{apiConfig.siteId || "—"}</Ltr></dd></div>
        </dl>
        {apiConfig.configured ? (
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="button" onClick={runTest} disabled={test === "testing"}>
              <PlugZap size={18} aria-hidden />
              {test === "testing" ? "جارٍ الاختبار…" : "اختبار الاتصال"}
            </button>
            {test === "ok" && (
              <span className="status-line" data-ok="true" role="status">
                <CircleCheck size={16} aria-hidden />
                الخادم يستجيب
              </span>
            )}
            {test === "failed" && (
              <span className="status-line" data-ok="false" role="status">
                <ServerOff size={16} aria-hidden />
                لا يستجيب الخادم
              </span>
            )}
          </div>
        ) : (
          <p className="card-sub" style={{ marginTop: 12 }}>
            لعرض قراءات حية اضبط المتغيرين <Ltr>NEXT_PUBLIC_TAQATI_API_URL</Ltr> و<Ltr>NEXT_PUBLIC_TAQATI_SITE_ID</Ltr> في بيئة النشر ثم أعد بناء التطبيق.
          </p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">إعادة الضبط</h2>
        </div>
        <button type="button" className="button" onClick={reset}>
          <RotateCcw size={18} aria-hidden />
          استعادة الإعدادات الافتراضية
        </button>
      </section>
    </main>
  );
}
