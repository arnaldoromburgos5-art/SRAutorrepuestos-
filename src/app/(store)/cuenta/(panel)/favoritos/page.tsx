import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getProductsByIds } from "@/lib/catalog";
import { ProductGrid } from "@/components/store/product-card";

export const metadata: Metadata = { title: "Favoritos" };

export default async function FavoritesPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("favorites").select("product_id").eq("user_id", user!.id).order("created_at", { ascending: false });
  const items = await getProductsByIds((data ?? []).map((f) => f.product_id as string));
  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl font-bold uppercase">Favoritos</h2>
      {items.length ? <ProductGrid items={items} /> : <p className="text-ink-500">Guardá productos con el botón “Guardar” de cada ficha.</p>}
    </section>
  );
}
