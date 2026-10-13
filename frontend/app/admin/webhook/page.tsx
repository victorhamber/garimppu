import type { Metadata } from "next";
import { WebhookSettingsView } from "@/components/WebhookSettingsView";

export const metadata: Metadata = { title: "Webhook de compra" };

export default function AdminWebhookPage() {
  return <WebhookSettingsView />;
}
