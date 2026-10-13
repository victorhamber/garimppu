import type { Metadata } from "next";
import { Suspense } from "react";
import { CollectionDetailView } from "@/components/CollectionDetailView";

export const metadata: Metadata = { title: "Coleção" };

export default function CollectionPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <CollectionDetailView />
    </Suspense>
  );
}
