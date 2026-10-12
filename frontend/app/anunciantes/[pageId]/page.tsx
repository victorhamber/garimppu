import { Suspense } from "react";
import { AdvertiserView } from "@/components/AdvertiserView";

export default function AdvertiserPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <AdvertiserView />
    </Suspense>
  );
}
