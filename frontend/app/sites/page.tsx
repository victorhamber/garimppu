import type { Metadata } from "next";
import { Suspense } from "react";
import { SitesView } from "@/components/SitesView";

export const metadata: Metadata = { title: "Sites de venda" };

export default function SitesPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <SitesView />
    </Suspense>
  );
}
