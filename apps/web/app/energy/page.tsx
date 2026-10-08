import type { Metadata } from "next";
import { EnergyView } from "../../components/views/energy-view";

export const metadata: Metadata = { title: "الطاقة" };

export default function Page() {
  return <EnergyView />;
}
