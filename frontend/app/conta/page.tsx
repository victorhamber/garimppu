import type { Metadata } from "next";
import { AccountView } from "@/components/AccountView";

export const metadata: Metadata = { title: "Minha conta" };

export default function AccountPage() {
  return <AccountView />;
}
