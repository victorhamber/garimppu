import { Suspense } from "react";
import { CollectionDetailView } from "@/components/CollectionDetailView";

export default function CollectionPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <CollectionDetailView />
    </Suspense>
  );
}
