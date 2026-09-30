import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_RATES, parseCurrency, type Rates } from "@/lib/money";
import type { Brand, CatalogItem, Category, Compat, ShippingZone, VehicleSelection } from "@/lib/types";

export const VEHICLE_COOKIE = "sr_vehicle";
export const CURRENCY_COOKIE = "sr_currency";

export async function getVehicleSelection(): Promise<VehicleSelection | null> {
  const raw = (await cookies()).get(VEHICLE_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as VehicleSelection;
    if (typeof parsed.versionId === "string" && /^[0-9a-f-]{36}$/i.test(parsed.versionId) && Number.isInteger(parsed.year)) {
      return parsed;
    }
  } catch {}
  return null;
}

export async function getCurrency() {
  return parseCurrency((await cookies()).get(CURRENCY_COOKIE)?.value);
}

export type PublicSettings = {
  store: {
    name: string; phone: string; whatsapp: string; email: string; address: string; hours: string; ruc?: string; legal_name?: string;
  };
  currency: { base: "PYG"; rates: Rates; note?: string };
  checkout: { reservation_minutes: number; guest_checkout: boolean };
  policies: { shipping: string; warranty: string; returns: string; payment: string };
};

const DEFAULT_SETTINGS: PublicSettings = {
  store: { name: "SR Autorrepuestos", phone: "", whatsapp: "", email: "", address: "Paraguay", hours: "" },
  currency: { base: "PYG", rates: DEFAULT_RATES },
  checkout: { reservation_minutes: 45, guest_checkout: true },
  policies: { shipping: "", warranty: "", returns: "", payment: "" },
};

export const getPublicSettings = cache(async (): Promise<PublicSettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value").eq("is_public", true);
  const out = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
  for (const row of data ?? []) out[row.key as string] = { ...(out[row.key as string] as object), ...(row.value as object) };
  return out as PublicSettings;
});

export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").order("sort").order("name");
  return (data ?? []) as Category[];
});

export const getBrands = cache(async (): Promise<Brand[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select("*").order("name");
  return (data ?? []) as Brand[];
});

export type SearchParams = {
  q?: string;
  category?: string;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  versionId?: string | null;
  compat?: "all" | "confirmed" | "exclude_incompatible";
  sort?: "relevance" | "price_asc" | "price_desc" | "popular" | "newest";
  limit?: number;
  offset?: number;
};

export async function searchCatalog(params: SearchParams) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_catalog", {
    p_query: params.q?.trim() || null,
    p_category: params.category || null,
    p_brands: params.brands?.length ? params.brands : null,
    p_min_price: params.minPrice ?? null,
    p_max_price: params.maxPrice ?? null,
    p_in_stock: params.inStock ?? false,
    p_version: params.versionId ?? null,
    p_compat: params.compat ?? (params.versionId ? "exclude_incompatible" : "all"),
    // "relevance" con vehículo elegido ordena primero los compatibles confirmados.
    p_sort: params.sort ?? (params.q || params.versionId ? "relevance" : "popular"),
    p_limit: params.limit ?? 24,
    p_offset: params.offset ?? 0,
    p_on_sale: params.onSale ?? false,
  });
  if (error) throw new Error(error.message);
  const items = (data ?? []) as CatalogItem[];
  return { items, total: Number(items[0]?.total_count ?? 0) };
}

export type ProductDetail = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  status: string;
  specs: Record<string, string>;
  warranty_months: number | null;
  warranty_text: string | null;
  is_universal: boolean;
  tax_rate: number;
  variant_group: string | null;
  variant_label: string | null;
  weight_grams: number | null;
  brand: { name: string; slug: string; country: string | null } | null;
  category: { name: string; slug: string; parent_id: string | null } | null;
  images: { url: string; alt: string | null }[];
  references: { kind: "oem" | "alternative" | "manufacturer"; code: string; brand: string | null }[];
  fitments: {
    status: Compat;
    notes: string | null;
    version: { id: string; year_from: number; year_to: number | null; engine: string; fuel: string | null; model: string; make: string };
  }[];
  final_price: number;
  list_price: number;
  discount_percent: number;
  available: number;
  compatibility: Compat | null;
};

type FitmentRow = {
  status: Compat;
  notes: string | null;
  vehicle_versions: {
    id: string; year_from: number; year_to: number | null; engine: string; fuel: string | null;
    vehicle_models: { name: string; vehicle_makes: { name: string } };
  };
};

export async function getProductBySlug(slug: string, versionId?: string | null): Promise<ProductDetail | null> {
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("products")
    .select(`id, sku, name, slug, short_description, description, status, specs, warranty_months, warranty_text, is_universal,
      tax_rate, variant_group, variant_label, weight_grams,
      brand:brands(name, slug, country), category:categories(name, slug, parent_id),
      images:product_images(url, alt, sort), references:product_references(kind, code, brand),
      fitments:product_fitments(status, notes, vehicle_versions(id, year_from, year_to, engine, fuel, vehicle_models(name, vehicle_makes(name))))`)
    .eq("slug", slug)
    .maybeSingle();
  if (!p) return null;

  const { data: price } = await supabase
    .from("catalog_products")
    .select("final_price, list_price, discount_percent, available")
    .eq("id", p.id)
    .single();

  const fitments = ((p.fitments ?? []) as unknown as FitmentRow[])
    .map((f) => ({
      status: f.status,
      notes: f.notes,
      version: {
        id: f.vehicle_versions.id,
        year_from: f.vehicle_versions.year_from,
        year_to: f.vehicle_versions.year_to,
        engine: f.vehicle_versions.engine,
        fuel: f.vehicle_versions.fuel,
        model: f.vehicle_versions.vehicle_models.name,
        make: f.vehicle_versions.vehicle_models.vehicle_makes.name,
      },
    }))
    .sort((a, b) => `${a.version.make} ${a.version.model}`.localeCompare(`${b.version.make} ${b.version.model}`));

  let compatibility: Compat | null = null;
  if (versionId) {
    const f = fitments.find((x) => x.version.id === versionId);
    compatibility = f?.status === "incompatible" ? "incompatible" : f?.status === "confirmed" || p.is_universal ? "confirmed" : "unverified";
  }

  const images = ((p.images ?? []) as { url: string; alt: string | null; sort: number }[]).sort((a, b) => a.sort - b.sort);

  return {
    ...(p as unknown as Omit<ProductDetail, "fitments" | "images" | "final_price" | "list_price" | "discount_percent" | "available" | "compatibility">),
    specs: (p.specs ?? {}) as Record<string, string>,
    images,
    fitments,
    final_price: Number(price?.final_price ?? 0),
    list_price: Number(price?.list_price ?? 0),
    discount_percent: Number(price?.discount_percent ?? 0),
    available: Number(price?.available ?? 0),
    compatibility,
  };
}

/** Relacionados y complementarios, más variantes del mismo grupo. */
export async function getProductRelations(productId: string, variantGroup: string | null) {
  const supabase = await createClient();
  const { data: rel } = await supabase.from("product_relations").select("related_id, kind").eq("product_id", productId);
  const ids = [...new Set((rel ?? []).map((r) => r.related_id as string))];
  const { data: items } = ids.length
    ? await supabase.from("catalog_products").select("*").in("id", ids).eq("status", "published")
    : { data: [] };
  const byId = new Map((items ?? []).map((i) => [i.id as string, i as unknown as CatalogItem]));
  const pick = (kind: string) =>
    (rel ?? []).filter((r) => r.kind === kind).map((r) => byId.get(r.related_id as string)).filter(Boolean) as CatalogItem[];

  let variants: { id: string; slug: string; variant_label: string | null; available: number }[] = [];
  if (variantGroup) {
    const { data } = await supabase
      .from("catalog_products")
      .select("id, slug, variant_label, available")
      .eq("variant_group", variantGroup)
      .eq("status", "published")
      .order("variant_label");
    variants = (data ?? []) as typeof variants;
  }
  return { related: pick("related"), complementary: pick("complementary"), variants };
}

export async function getProductsByIds(ids: string[]) {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("catalog_products").select("*").in("id", ids).eq("status", "published");
  return (data ?? []) as unknown as CatalogItem[];
}

export const getShippingZones = cache(async (): Promise<ShippingZone[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("shipping_zones").select("*").eq("active", true).order("sort");
  return (data ?? []) as ShippingZone[];
});

export async function getBanners(placement: "hero" | "strip") {
  const supabase = await createClient();
  const { data } = await supabase.from("banners").select("*").eq("placement", placement).order("sort");
  return (data ?? []) as {
    id: string; title: string; subtitle: string | null; cta_label: string | null; link_url: string | null; image_url: string | null;
  }[];
}

export async function getPage(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("pages").select("*").eq("slug", slug).maybeSingle();
  return data as { title: string; body: string; updated_at: string } | null;
}

export function compatLabel(c: Compat | null) {
  return c === "confirmed" ? "Compatible confirmado" : c === "incompatible" ? "No compatible" : c === "unverified" ? "Pendiente de verificar" : null;
}
