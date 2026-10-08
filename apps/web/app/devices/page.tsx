import type { Metadata } from "next";
import { DevicesView } from "../../components/views/devices-view";

export const metadata: Metadata = { title: "الأجهزة" };

export default function Page() {
  return <DevicesView />;
}
