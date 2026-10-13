import { Suspense } from "react";
import { TikTokView } from "@/components/TikTokView";

export default function TikTokPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <TikTokView />
    </Suspense>
  );
}
