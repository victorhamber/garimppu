import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordView } from "@/components/PasswordRecovery";

export const metadata: Metadata = { title: "Nova senha" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordView />
    </Suspense>
  );
}
