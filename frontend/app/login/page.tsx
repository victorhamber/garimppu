import { Suspense } from "react";
import { LoginView } from "@/components/LoginView";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}
