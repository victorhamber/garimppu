import type { Metadata } from "next";
import { EmailSettingsView } from "@/components/EmailSettingsView";

export const metadata: Metadata = { title: "E-mail" };

export default function AdminEmailPage() {
  return <EmailSettingsView />;
}
