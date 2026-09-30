import "server-only";
import type { AnyClient } from "@/lib/supabase/types";
import type { ProductFormData } from "@/components/admin/product-form";

export async function loadCatalogOptions(db: AnyClient) {
  const [{ data: brands }, { data: categories }, { data: makes }] = await Promise.all([
    db.from("brands").select("id, name").order("name"),
    db.from("categories").select("id, name, parent_id").order("sort"),
    db.from("vehicle_makes").select("id, name").order("name"),
  ]);
  return {
    brands: (brands ?? []) as { id: string; name: string }[],
    categories: (categories ?? []) as { id: string; name: string; parent_id: string | null }[],
    makes: (makes ?? []) as { id: string; name: string }[],
  };
}

export const emptyProduct: ProductFormData = {
  sku: "", name: "", short_description: "", description: "", brand_id: "", category_id: "", status: "draft",
  price: "", compare_at_price: "", wholesale_price: "", cost: "", tax_rate: 10, is_universal: false,
  specs: [{ key: "", value: "" }], warranty_months: "", warranty_text: "", weight_grams: "", variant_group: "", variant_label: "",
  min_stock: "0", references: [], images: [], fitments: [], relations: [], initial_stock: "",
};

type FitRow = { version_id: string; status: "confirmed" | "unverified" | "incompatible"; notes: string | null; vehicle_versions: { year_from: number; year_to: number | null; engine: string; vehicle_models: { name: string; vehicle_makes: { name: string } } } };

export async function loadProductForm(db: AnyClient, id: string): Promise<{ form: ProductFormData; onHand: number } | null> {
  const { data: p } = await db
    .from("products")
    .select(`*, product_references(kind, code, brand), product_images(url, alt, sort), stock_levels(on_hand),
      product_fitments(version_id, status, notes, vehicle_versions(year_from, year_to, engine, vehicle_models(name, vehicle_makes(name)))),
      product_relations!product_relations_product_id_fkey(related_id, kind, related:products!product_relations_related_id_fkey(sku, name))`)
    .eq("id", id)
    .maybeSingle();
  if (!p) return null;
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const stock = Array.isArray(p.stock_levels) ? p.stock_levels[0] : p.stock_levels;
  return {
    onHand: stock?.on_hand ?? 0,
    form: {
      id: p.id, sku: p.sku, name: p.name, slug: p.slug, short_description: s(p.short_description), description: s(p.description),
      brand_id: s(p.brand_id), category_id: s(p.category_id), status: p.status, price: s(p.price), compare_at_price: s(p.compare_at_price),
      wholesale_price: s(p.wholesale_price), cost: s(p.cost), tax_rate: p.tax_rate, is_universal: p.is_universal,
      specs: Object.entries((p.specs ?? {}) as Record<string, string>).map(([key, value]) => ({ key, value: String(value) })),
      warranty_months: s(p.warranty_months), warranty_text: s(p.warranty_text), weight_grams: s(p.weight_grams),
      variant_group: s(p.variant_group), variant_label: s(p.variant_label), min_stock: s(p.min_stock),
      references: p.product_references ?? [],
      images: ((p.product_images ?? []) as { url: string; alt: string | null; sort: number }[]).sort((a, b) => a.sort - b.sort),
      fitments: ((p.product_fitments ?? []) as FitRow[]).map((f) => ({
        version_id: f.version_id,
        status: f.status,
        notes: f.notes,
        label: `${f.vehicle_versions.vehicle_models.vehicle_makes.name} ${f.vehicle_versions.vehicle_models.name} ${f.vehicle_versions.year_from}–${f.vehicle_versions.year_to ?? "act."} ${f.vehicle_versions.engine}`,
      })),
      relations: ((p.product_relations ?? []) as { related_id: string; kind: "related" | "complementary"; related: { sku: string; name: string } }[]).map((r) => ({
        related_id: r.related_id,
        kind: r.kind,
        label: `${r.related?.sku} · ${r.related?.name}`,
      })),
      initial_stock: "",
    },
  };
}
