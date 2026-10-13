import type { Metadata } from "next";
import { Suspense } from "react";
import { CreativeDetailView } from "@/components/CreativeDetailView";

export const metadata: Metadata = { title: "Criativo" };

export default function CreativePage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <CreativeDetailView />
    </Suspense>
  );
}
