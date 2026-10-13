import { Suspense } from "react";
import { Explorer } from "@/components/Explorer";

export default function CreativesPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <Explorer />
    </Suspense>
  );
}
