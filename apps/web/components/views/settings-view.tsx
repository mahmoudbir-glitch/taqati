"use client";

import { CircleCheck, CloudOff, PlugZap, Save, ServerOff, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  apiConfig,
  fetchSmartessStatus,
  removeSmartess,
  saveSmartess,
  testSmartess,
  type SmartessAccount,
  type SmartessStatus,
  type SmartessTestResult,
} from "../../lib/api";
import { dateTime, kw, percent } from "../../lib/format";
import { EmptyState, Ltr, PageHeader } from "../ui";

const SOURCE_LABEL: Record<SmartessStatus["source"], string> = {
  database: "حساب محفوظ في الخادم",
  environment: "حساب من متغيرات بيئة الخادم",
  none: "غير مضبوط",
};

const emptyAccount: SmartessAccount = { username: "", password: "", devicePn: "", deviceSn: "", enabled: true };

type Busy = "save" | "test" | "remove" | null;
type Notice = { ok: boolean; text: string } | null;

function explain(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "رمز الإدارة غير صحيح.";
    if (error.status === 503) return "الخادم غير مهيأ للحفظ: اضبط ADMIN_TOKEN في بيئة الخادم.";
    if (error.status === 400) return `البيانات المدخلة غير مقبولة (${error.message}).`;
    return `رفض الخادم الطلب (${error.status}).`;
  }
  return "تعذّر الاتصال بخادم طاقتي.";
}

export function SettingsView() {
  const [status, setStatus] = useState<SmartessStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [account, setAccount] = useState<SmartessAccount>(emptyAccount);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [testResult, setTestResult] = useState<SmartessTestResult | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchSmartessStatus());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (apiConfig.configured) void load();
  }, [load]);

  if (!apiConfig.configured) {
    return (
      <main className="page">
        <PageHeader title="الإعدادات" subtitle="ربط الإنفرتر بحساب SmartESS" />
        <EmptyState
          icon={CloudOff}
          title="إعداد SmartESS يحتاج خادم طاقتي"
          message="هذه النسخة تعمل ببيانات تجريبية دون خادم. لربط حساب SmartESS شغّل خادم طاقتي ثم اضبط عنوانه ومعرّف الموقع في بيئة نشر الواجهة."
        >
          <p className="card-sub">
            <Ltr>NEXT_PUBLIC_TAQATI_API_URL</Ltr> و<Ltr>NEXT_PUBLIC_TAQATI_SITE_ID</Ltr>
          </p>
        </EmptyState>
      </main>
    );
  }

  const set = <K extends keyof SmartessAccount>(key: K, value: SmartessAccount[K]) => setAccount((current) => ({ ...current, [key]: value }));
  const hasSavedPassword = status?.source === "database";

  const validate = (): SmartessAccount | null => {
    const clean = { ...account, username: account.username.trim(), devicePn: account.devicePn.trim(), deviceSn: account.deviceSn.trim() };
    let problem = "";
    if (!clean.username) problem = "اكتب اسم مستخدم SmartESS.";
    else if (!clean.password && !hasSavedPassword) problem = "اكتب كلمة مرور SmartESS.";
    else if (clean.devicePn && !/^[A-Za-z0-9]+$/.test(clean.devicePn)) problem = "رقم Datalogger (PN) يتكون من حروف إنجليزية وأرقام فقط.";
    else if (clean.deviceSn && !/^[A-Za-z0-9]+$/.test(clean.deviceSn)) problem = "الرقم التسلسلي (SN) يتكون من حروف إنجليزية وأرقام فقط.";
    else if (!token.trim()) problem = "اكتب رمز الإدارة.";
    if (problem) {
      setNotice({ ok: false, text: problem });
      return null;
    }
    return clean;
  };

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(kind);
    setNotice(null);
    setTestResult(null);
    try {
      await action();
    } catch (error) {
      setNotice({ ok: false, text: explain(error) });
    } finally {
      setBusy(null);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = validate();
    if (!clean) return;
    void run("save", async () => {
      setStatus(await saveSmartess(token.trim(), clean));
      setAccount((current) => ({ ...current, password: "" }));
      setNotice({ ok: true, text: clean.enabled ? "تم الحفظ وبدأ الخادم بسحب القراءات من SmartESS." : "تم الحفظ والسحب من SmartESS متوقف." });
    });
  };

  const test = () => {
    const clean = validate();
    if (!clean) return;
    void run("test", async () => setTestResult(await testSmartess(token.trim(), clean)));
  };

  const remove = () => {
    if (!token.trim()) {
      setNotice({ ok: false, text: "اكتب رمز الإدارة." });
      return;
    }
    if (!window.confirm("حذف حساب SmartESS المحفوظ في الخادم؟")) return;
    void run("remove", async () => {
      setStatus(await removeSmartess(token.trim()));
      setAccount(emptyAccount);
      setNotice({ ok: true, text: "تم حذف الحساب المحفوظ." });
    });
  };

  return (
    <main className="page">
      <PageHeader title="الإعدادات" subtitle="ربط الإنفرتر بحساب SmartESS" />

      {loadFailed && (
        <div className="banner" data-severity="critical" role="alert">
          <ServerOff size={18} aria-hidden />
          <span>تعذّر الاتصال بخادم طاقتي لقراءة حالة SmartESS.</span>
        </div>
      )}

      {status && (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">حالة الاتصال</h2>
            <span className="status-line" data-ok={status.polling && !status.lastError} style={{ fontSize: 14 }}>
              <span className="dot" />
              {status.polling ? (status.lastError ? "السحب يعمل لكن آخر محاولة فشلت" : "السحب يعمل") : "السحب متوقف"}
            </span>
          </div>
          <dl className="kv">
            <div><dt>المصدر</dt><dd>{SOURCE_LABEL[status.source]}</dd></div>
            <div><dt>اسم المستخدم</dt><dd><Ltr>{status.username ?? "—"}</Ltr></dd></div>
            <div><dt>رقم Datalogger (PN)</dt><dd><Ltr>{status.devicePn ?? "—"}</Ltr></dd></div>
            <div><dt>الرقم التسلسلي (SN)</dt><dd><Ltr>{status.deviceSn ?? "—"}</Ltr></dd></div>
            <div><dt>آخر قراءة ناجحة</dt><dd>{status.lastSuccessAt ? dateTime(new Date(status.lastSuccessAt).getTime()) : "—"}</dd></div>
            {status.lastError && <div><dt>آخر خطأ</dt><dd><Ltr>{status.lastError}</Ltr></dd></div>}
          </dl>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">حساب SmartESS</h2>
        </div>
        <p className="card-sub" style={{ marginBottom: 14 }}>
          اسم المستخدم وكلمة المرور هما نفسهما في تطبيق SmartESS على هاتفك. تُحفظ كلمة المرور مشفّرة في الخادم ولا تُعرض مرة أخرى.
        </p>

        {status && !status.canEdit && (
          <div className="banner" data-severity="warning" role="status" style={{ marginBottom: 14 }}>
            <TriangleAlert size={18} aria-hidden />
            <span>
              الخادم غير مهيأ للحفظ. اضبط <Ltr>ADMIN_TOKEN</Ltr> (16 حرفًا على الأقل) في بيئة الخادم ثم أعد تشغيله.
            </span>
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <div className="form two">
            <div className="field">
              <label htmlFor="smartess-username">اسم مستخدم SmartESS</label>
              <input id="smartess-username" className="input" dir="ltr" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={120} value={account.username} onChange={(event) => set("username", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="smartess-password">كلمة مرور SmartESS</label>
              <input id="smartess-password" className="input" dir="ltr" type="password" autoComplete="new-password" maxLength={200} placeholder={hasSavedPassword ? "•••••••• (محفوظة)" : ""} value={account.password} onChange={(event) => set("password", event.target.value)} />
              {hasSavedPassword && <small>اتركها فارغة للإبقاء على كلمة المرور المحفوظة.</small>}
            </div>
            <div className="field">
              <label htmlFor="smartess-pn">رقم <Ltr>Datalogger (PN)</Ltr> <span className="muted">(اختياري)</span></label>
              <input id="smartess-pn" className="input" dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={120} value={account.devicePn} onChange={(event) => set("devicePn", event.target.value)} />
              <small>اتركه فارغًا ليكتشف الخادم الجهاز من حسابك. يلزم فقط إذا كان في الحساب أكثر من جهاز.</small>
            </div>
            <div className="field">
              <label htmlFor="smartess-sn">الرقم التسلسلي للجهاز <Ltr>(SN)</Ltr> <span className="muted">(اختياري)</span></label>
              <input id="smartess-sn" className="input" dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={120} value={account.deviceSn} onChange={(event) => set("deviceSn", event.target.value)} />
              <small>كما يظهر في صفحة الجهاز في تطبيق SmartESS. اتركه فارغًا للاكتشاف التلقائي.</small>
            </div>
            <div className="field">
              <label htmlFor="admin-token">رمز الإدارة</label>
              <input id="admin-token" className="input" dir="ltr" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} />
              <small>
                قيمة <Ltr>ADMIN_TOKEN</Ltr> في بيئة الخادم. لا تُحفظ في المتصفح.
              </small>
            </div>
            <div className="field">
              <label htmlFor="smartess-enabled" style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}>
                <input id="smartess-enabled" type="checkbox" style={{ width: 20, height: 20 }} checked={account.enabled} onChange={(event) => set("enabled", event.target.checked)} />
                تفعيل السحب من SmartESS
              </label>
              <small>يقرأ الخادم بيانات الإنفرتر من سحابة SmartESS كل خمس دقائق.</small>
            </div>
          </div>

          {notice && (
            <p className="banner" data-severity={notice.ok ? "info" : "critical"} role={notice.ok ? "status" : "alert"} style={{ marginTop: 14 }}>
              {notice.ok ? <CircleCheck size={18} aria-hidden /> : <TriangleAlert size={18} aria-hidden />}
              <span>{notice.text}</span>
            </p>
          )}

          {testResult && (
            <p className="banner" data-severity={testResult.ok ? "info" : "critical"} role={testResult.ok ? "status" : "alert"} style={{ marginTop: 14 }}>
              {testResult.ok ? <CircleCheck size={18} aria-hidden /> : <TriangleAlert size={18} aria-hidden />}
              {testResult.ok ? (
                <span>
                  نجح الاتصال بـ SmartESS (الجهاز <Ltr>{testResult.deviceSn}</Ltr>). الشمس <Ltr>{testResult.solarPowerW === null ? "—" : kw(testResult.solarPowerW)}</Ltr>، الحمل{" "}
                  <Ltr>{testResult.loadPowerW === null ? "—" : kw(testResult.loadPowerW)}</Ltr>، البطارية{" "}
                  <Ltr>{testResult.batterySoc === null ? "—" : percent(testResult.batterySoc)}</Ltr>.
                </span>
              ) : (
                <span>
                  فشل الاتصال بـ SmartESS: <Ltr>{testResult.error}</Ltr>
                </span>
              )}
            </p>
          )}

          <div className="actions" style={{ marginTop: 16 }}>
            <button type="submit" className="button primary" disabled={busy !== null}>
              <Save size={18} aria-hidden />
              {busy === "save" ? "جارٍ الحفظ…" : "حفظ"}
            </button>
            <button type="button" className="button" onClick={test} disabled={busy !== null}>
              <PlugZap size={18} aria-hidden />
              {busy === "test" ? "جارٍ الاختبار…" : "اختبار الاتصال"}
            </button>
            {hasSavedPassword && (
              <button type="button" className="button" onClick={remove} disabled={busy !== null}>
                <Trash2 size={18} aria-hidden />
                {busy === "remove" ? "جارٍ الحذف…" : "حذف الحساب المحفوظ"}
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
