import type { Metadata } from "next";
import { LoginForm } from "@/components/store/auth-forms";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase">Ingresar</h1>
      <p className="mb-6 text-sm text-ink-500">Seguí tus pedidos, guardá tus vehículos y comprá más rápido.</p>
      <LoginForm next={next} error={error} />
    </>
  );
}
