import { Suspense } from "react";
import { CreativeDetailView } from "@/components/CreativeDetailView";

export default function CreativePage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <CreativeDetailView />
    </Suspense>
  );
}
