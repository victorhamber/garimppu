import { Suspense } from "react";
import { ResetPasswordView } from "@/components/PasswordRecovery";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordView />
    </Suspense>
  );
}
