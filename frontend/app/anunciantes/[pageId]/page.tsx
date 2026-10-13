import type { Metadata } from "next";
import { Suspense } from "react";
import { AdvertiserView } from "@/components/AdvertiserView";

export const metadata: Metadata = { title: "Anunciante" };

export default function AdvertiserPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <AdvertiserView />
    </Suspense>
  );
}
