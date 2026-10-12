import { Suspense } from "react";
import { Explorer } from "@/components/Explorer";

export default function Home() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <Explorer />
    </Suspense>
  );
}
