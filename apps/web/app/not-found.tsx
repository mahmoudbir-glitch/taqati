import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "الصفحة غير موجودة" };

export default function NotFound() {
  return (
    <main className="page">
      <section className="card empty">
        <span className="tile-icon">
          <Compass size={26} aria-hidden />
        </span>
        <h2>الصفحة غير موجودة</h2>
        <p>الرابط الذي فتحته لا يقود إلى صفحة في طاقتي.</p>
        <Link href="/" className="button primary">العودة إلى الرئيسية</Link>
      </section>
    </main>
  );
}
