"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page">
      <section className="card empty" role="alert">
        <span className="tile-icon" data-severity="critical">
          <TriangleAlert size={26} aria-hidden />
        </span>
        <h2>حدث خطأ غير متوقع</h2>
        <p>تعذّر عرض هذه الصفحة. جرّب إعادة المحاولة، وإن تكرر الخطأ عد إلى الرئيسية.</p>
        <div className="actions">
          <button type="button" className="button primary" onClick={reset}>إعادة المحاولة</button>
          <Link href="/" className="button">الرئيسية</Link>
        </div>
      </section>
    </main>
  );
}
