import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { AddressForm, DeleteButton } from "@/components/store/account-forms";
import { deleteAddress } from "../../account-actions";

export const metadata: Metadata = { title: "Mis direcciones" };

export default async function AddressesPage() {
  const { supabase, user } = await requireUser();
  const { data: addresses } = await supabase.from("addresses").select("*").eq("user_id", user!.id).order("created_at");
  return (
    <section className="space-y-6 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
      <h2 className="font-display text-2xl font-bold uppercase">Direcciones</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {(addresses ?? []).map((a) => (
          <li key={a.id} className="flex justify-between gap-3 rounded-xl border border-ink-100 p-4 text-sm">
            <div>
              <p className="font-semibold">{a.label}</p>
              <p className="text-ink-600">{a.street}, {a.city}, {a.department}</p>
              <p className="text-ink-400">{a.recipient} · {a.phone}</p>
            </div>
            <DeleteButton action={deleteAddress.bind(null, a.id)} />
          </li>
        ))}
      </ul>
      <AddressForm />
    </section>
  );
}
