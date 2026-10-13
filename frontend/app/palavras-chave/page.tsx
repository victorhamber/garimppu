import { Suspense } from "react";
import { KeywordsView } from "@/components/KeywordsView";

export default function KeywordsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <KeywordsView />
    </Suspense>
  );
}
