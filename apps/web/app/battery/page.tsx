import type { Metadata } from "next";
import { BatteryView } from "../../components/views/battery-view";

export const metadata: Metadata = { title: "البطارية" };

export default function Page() {
  return <BatteryView />;
}
