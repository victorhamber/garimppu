import { Suspense } from "react";
import { OffersView } from "@/components/OffersView";

export default function OffersPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <OffersView />
    </Suspense>
  );
}
