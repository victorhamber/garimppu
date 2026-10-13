import { Suspense } from "react";
import { VideosView } from "@/components/VideosView";

export default function VideosPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <VideosView />
    </Suspense>
  );
}
