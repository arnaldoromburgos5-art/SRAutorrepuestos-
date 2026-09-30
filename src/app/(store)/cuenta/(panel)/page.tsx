import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ProfileForm } from "@/components/store/account-forms";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, profile } = await requireUser();
  const { data: full } = await supabase.from("profiles").select("marketing_consent").eq("id", profile.id).single();
  return (
    <section className="space-y-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
      {error === "sin-acceso" ? (
        <p className="rounded-lg bg-warn-50 p-3 text-sm text-warn-600">Tu usuario no tiene acceso al panel administrativo.</p>
      ) : null}
      <h2 className="font-display text-2xl font-bold uppercase">Mis datos</h2>
      <ProfileForm profile={{ ...profile, marketing_consent: full?.marketing_consent ?? false }} />
      {profile.is_wholesale ? <p className="text-sm text-ok-600">Tu cuenta tiene precios mayoristas habilitados.</p> : null}
    </section>
  );
}
