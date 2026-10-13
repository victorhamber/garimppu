import type { Metadata } from "next";
import { Suspense } from "react";
import { VideosView } from "@/components/VideosView";

export const metadata: Metadata = { title: "Vídeos do YouTube" };

export default function VideosPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <VideosView />
    </Suspense>
  );
}
