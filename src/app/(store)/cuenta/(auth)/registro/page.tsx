import type { Metadata } from "next";
import { RegisterForm } from "@/components/store/auth-forms";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase">Crear cuenta</h1>
      <p className="mb-6 text-sm text-ink-500">Es gratis y te permite guardar direcciones, vehículos y favoritos.</p>
      <RegisterForm />
    </>
  );
}
