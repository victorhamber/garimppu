import type { Metadata } from "next";
import { LeadsView } from "@/components/LeadsView";

export const metadata: Metadata = { title: "Leads da extensão" };

export default function AdminLeadsPage() {
  return <LeadsView />;
}
