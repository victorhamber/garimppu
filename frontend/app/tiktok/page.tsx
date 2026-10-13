import type { Metadata } from "next";
import { Suspense } from "react";
import { TikTokView } from "@/components/TikTokView";

export const metadata: Metadata = { title: "Anúncios do TikTok" };

export default function TikTokPage() {
  return (
    <Suspense fallback={<p className="text-muted">Carregando...</p>}>
      <TikTokView />
    </Suspense>
  );
}
