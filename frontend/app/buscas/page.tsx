import type { Metadata } from "next";
import { SearchManager } from "@/components/SearchManager";

export const metadata: Metadata = { title: "Minerar" };

export default function SearchesPage() {
  return <SearchManager />;
}
