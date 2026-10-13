import type { Metadata } from "next";
import { CollectionsView } from "@/components/CollectionsView";

export const metadata: Metadata = { title: "Coleções" };

export default function CollectionsPage() {
  return <CollectionsView />;
}
