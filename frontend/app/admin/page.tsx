import type { Metadata } from "next";
import { AdminView } from "@/components/AdminView";

export const metadata: Metadata = { title: "Licenças" };

export default function AdminPage() {
  return <AdminView />;
}
