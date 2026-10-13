import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginView } from "@/components/LoginView";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}
