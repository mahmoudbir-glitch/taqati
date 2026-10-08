"use client";

import { LockKeyhole, LogIn, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { signIn } from "../lib/api";
import { useTelemetry } from "./telemetry-provider";

/** Sign-in screen of the built-in backend; shown instead of any page until signed in. */
export function LoginView() {
  const { refreshBackend } = useTelemetry();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError("اكتب كلمة المرور.");
      return;
    }
    setBusy(true);
    setError("");
    const problem = await signIn(password);
    if (problem) {
      setError(problem);
      setBusy(false);
      return;
    }
    await refreshBackend();
  };

  return (
    <main className="page">
      <section className="card" style={{ maxWidth: 420, width: "100%", marginInline: "auto", marginTop: 24 }}>
        <div className="device-head">
          <span className="tile-icon">
            <LockKeyhole size={22} aria-hidden />
          </span>
          <div>
            <h1 className="card-title" style={{ fontSize: 20 }}>تسجيل الدخول</h1>
            <p className="card-sub">قراءات المنظومة محمية بكلمة مرور.</p>
          </div>
        </div>
        <form onSubmit={submit} noValidate className="form" style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="site-password">كلمة المرور</label>
            <input
              id="site-password"
              className="input"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && (
            <p className="banner" data-severity="critical" role="alert">
              <TriangleAlert size={18} aria-hidden />
              <span>{error}</span>
            </p>
          )}
          <button type="submit" className="button primary" disabled={busy}>
            <LogIn size={18} aria-hidden />
            {busy ? "جارٍ الدخول…" : "دخول"}
          </button>
        </form>
      </section>
    </main>
  );
}
