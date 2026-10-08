const stats = [
  ["الطاقة الشمسية", "4.82 kW", "إنتاج الآن"],
  ["البطارية", "78%", "حالة الشحن"],
  ["استهلاك المنزل", "2.31 kW", "حمل حالي"],
  ["الشبكة", "0 W", "استيراد / تصدير"],
] as const;

export default function HomePage() {
  return (
    <main className="container" style={{ paddingBlock: 28 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 28 }}>
        <div>
          <p style={{ color: "var(--accent)", margin: 0 }}>TAQATI</p>
          <h1 style={{ margin: "6px 0 0", fontSize: "clamp(28px, 6vw, 42px)" }}>منظومتك تحت السيطرة</h1>
        </div>
        <span className="card" style={{ padding: "10px 14px", color: "var(--muted)" }}>تجريبي</span>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>منزل محمود</h2>
            <p style={{ color: "var(--muted)", marginBottom: 0 }}>بوابة طاقتي · البيانات ستصل مباشرة من الـ Gateway</p>
          </div>
          <strong style={{ color: "var(--accent)" }}>● متصل</strong>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        {stats.map(([label, value, hint]) => (
          <article className="card" key={label}>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>{label}</p>
            <strong style={{ display: "block", fontSize: 28 }}>{value}</strong>
            <small style={{ color: "var(--muted)" }}>{hint}</small>
          </article>
        ))}
      </section>
    </main>
  );
}
