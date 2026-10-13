import type { Metadata } from "next";
import { Suspense } from "react";
import { ExtensionView } from "@/components/ExtensionView";

export const metadata: Metadata = { title: "Mineração avançada" };

export default function ExtensionPage() {
  return (
    <Suspense>
      <ExtensionView />
    </Suspense>
  );
}
