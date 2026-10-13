import type { Metadata } from "next";
import { Suspense } from "react";
import { KeywordsView } from "@/components/KeywordsView";

export const metadata: Metadata = { title: "Palavras-chave" };

export default function KeywordsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <KeywordsView />
    </Suspense>
  );
}
