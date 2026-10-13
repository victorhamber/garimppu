import type { Metadata } from "next";
import { Suspense } from "react";
import { OffersView } from "@/components/OffersView";

export const metadata: Metadata = { title: "Ofertas" };

export default function Home() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <OffersView />
    </Suspense>
  );
}
