import type { Metadata } from "next";
import { SettingsView } from "../../components/views/settings-view";

export const metadata: Metadata = { title: "الإعدادات" };

export default function Page() {
  return <SettingsView />;
}
