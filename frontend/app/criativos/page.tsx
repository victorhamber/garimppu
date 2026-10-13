import type { Metadata } from "next";
import { Suspense } from "react";
import { Explorer } from "@/components/Explorer";

export const metadata: Metadata = { title: "Criativos" };

export default function CreativesPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <Explorer />
    </Suspense>
  );
}
