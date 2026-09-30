import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { getPublicSettings, getShippingZones } from "@/lib/catalog";
import { CheckoutForm } from "@/components/store/checkout-form";

export const metadata: Metadata = { title: "Finalizar compra" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ cupon?: string }> }) {
  const { cupon } = await searchParams;
  const [{ supabase, user, profile }, zones, settings] = await Promise.all([getSession(), getShippingZones(), getPublicSettings()]);
  const { data: addresses } = user
    ? await supabase.from("addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false })
    : { data: [] };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 font-display text-4xl font-bold uppercase">Finalizar compra</h1>
      <CheckoutForm
        zones={zones}
        initialCoupon={cupon ?? ""}
        reservationMinutes={settings.checkout.reservation_minutes}
        storeAddress={settings.store.address}
        storeHours={settings.store.hours}
        loggedIn={!!user}
        profile={
          profile
            ? {
                full_name: profile.full_name ?? "",
                email: profile.email ?? user?.email ?? "",
                phone: profile.phone ?? "",
                document_type: profile.document_type ?? "CI",
                document_number: profile.document_number ?? "",
                business_name: profile.business_name ?? "",
              }
            : null
        }
        addresses={(addresses ?? []) as never}
      />
    </main>
  );
}
