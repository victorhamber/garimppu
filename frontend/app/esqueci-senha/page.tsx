import type { Metadata } from "next";
import { ForgotPasswordView } from "@/components/PasswordRecovery";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordView />;
}
