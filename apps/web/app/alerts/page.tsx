import type { Metadata } from "next";
import { AlertsView } from "../../components/views/alerts-view";

export const metadata: Metadata = { title: "التنبيهات" };

export default function Page() {
  return <AlertsView />;
}
