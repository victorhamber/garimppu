import { Suspense } from "react";
import { SitesView } from "@/components/SitesView";

export default function SitesPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <SitesView />
    </Suspense>
  );
}
