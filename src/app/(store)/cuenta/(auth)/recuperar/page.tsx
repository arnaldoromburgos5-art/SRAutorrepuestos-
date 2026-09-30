import type { Metadata } from "next";
import { ResetForm } from "@/components/store/auth-forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ResetPage() {
  return (
    <>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase">Recuperar contraseña</h1>
      <p className="mb-6 text-sm text-ink-500">Te enviamos un enlace para crear una contraseña nueva.</p>
      <ResetForm />
    </>
  );
}
