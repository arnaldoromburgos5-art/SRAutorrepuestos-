import type { Metadata } from "next";
import { NewPasswordForm } from "@/components/store/auth-forms";

export const metadata: Metadata = { title: "Contraseña" };

export default function NewPasswordPage() {
  return (
    <section className="max-w-md space-y-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
      <h2 className="font-display text-2xl font-bold uppercase">Cambiar contraseña</h2>
      <NewPasswordForm />
    </section>
  );
}
