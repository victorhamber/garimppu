import { Suspense } from "react";
import { OffersView } from "@/components/OffersView";

export default function Home() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <OffersView />
    </Suspense>
  );
}
