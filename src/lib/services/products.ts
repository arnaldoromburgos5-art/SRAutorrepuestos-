import "server-only";
import { z } from "zod";
import { friendlyDbError, slugify } from "@/lib/utils";
import { audit, ensure, type ServiceCtx } from "./context";

export const productInputSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().trim().min(2, "SKU obligatorio").max(60),
  name: z.string().trim().min(3, "Nombre obligatorio").max(160),
  slug: z.string().trim().max(100).optional(),
  short_description: z.string().trim().max(300).optional().nullable(),
  description: z.string().trim().max(6000).optional().nullable(),
  brand_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  price: z.number().int().min(0),
  compare_at_price: z.number().int().min(0).optional().nullable(),
  wholesale_price: z.number().int().min(0).optional().nullable(),
  cost: z.number().int().min(0).optional().nullable(),
  tax_rate: z.union([z.literal(0), z.literal(5), z.literal(10)]).default(10),
  is_universal: z.boolean().default(false),
  specs: z.record(z.string(), z.string()).default({}),
  warranty_months: z.number().int().min(0).max(120).optional().nullable(),
  warranty_text: z.string().trim().max(600).optional().nullable(),
  weight_grams: z.number().int().min(0).optional().nullable(),
  variant_group: z.string().uuid().optional().nullable(),
  variant_label: z.string().trim().max(60).optional().nullable(),
  min_stock: z.number().int().min(0).default(0),
  // Colecciones: si se omiten, se conservan las existentes.
  references: z
    .array(z.object({ kind: z.enum(["oem", "alternative", "manufacturer"]), code: z.string().trim().min(2).max(60), brand: z.string().trim().max(60).optional().nullable() }))
    .optional(),
  images: z.array(z.object({ url: z.string().min(1).max(600), alt: z.string().max(160).optional().nullable() })).optional(),
  fitments: z
    .array(z.object({ version_id: z.string().uuid(), status: z.enum(["confirmed", "unverified", "incompatible"]), notes: z.string().max(200).optional().nullable() }))
    .optional(),
  relations: z.array(z.object({ related_id: z.string().uuid(), kind: z.enum(["related", "complementary"]) })).optional(),
  initial_stock: z.number().int().min(0).optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;

/** Crea o actualiza un producto con sus referencias, imágenes, compatibilidades y relaciones. */
export async function saveProduct(ctx: ServiceCtx, raw: unknown) {
  ensure(ctx, "products.write");
  const input = productInputSchema.parse(raw);
  if (input.status === "published") ensure(ctx, "products.publish");
  if (!input.price && input.status === "published") throw new Error("Un producto publicado necesita precio.");

  const db = ctx.supabase;
  const before = input.id ? (await db.from("products").select("*").eq("id", input.id).single()).data : null;
  if (!before) ensure(ctx, "prices.write");
  if (before && (before.price !== input.price || before.cost !== (input.cost ?? null) || before.compare_at_price !== (input.compare_at_price ?? null))) {
    ensure(ctx, "prices.write");
  }

  const row = {
    sku: input.sku.toUpperCase(),
    name: input.name,
    slug: input.slug ? slugify(input.slug) : slugify(`${input.name}-${input.sku}`),
    short_description: input.short_description || null,
    description: input.description || null,
    brand_id: input.brand_id || null,
    category_id: input.category_id || null,
    status: input.status,
    price: input.price,
    compare_at_price: input.compare_at_price || null,
    wholesale_price: input.wholesale_price || null,
    cost: input.cost ?? null,
    tax_rate: input.tax_rate,
    is_universal: input.is_universal,
    specs: input.specs,
    warranty_months: input.warranty_months ?? null,
    warranty_text: input.warranty_text || null,
    weight_grams: input.weight_grams ?? null,
    variant_group: input.variant_group || null,
    variant_label: input.variant_label || null,
    min_stock: input.min_stock,
  };

  const { data: saved, error } = input.id
    ? await db.from("products").update(row).eq("id", input.id).select("id, slug").single()
    : await db.from("products").insert({ ...row, created_by: ctx.profile.id }).select("id, slug").single();
  if (error || !saved) throw new Error(friendlyDbError(error?.message));
  const id = saved.id as string;

  // Reemplazo de las colecciones enviadas.
  if (input.references) {
    await db.from("product_references").delete().eq("product_id", id);
    const unique = new Map(input.references.map((r) => [`${r.kind}:${r.code.toUpperCase()}`, r]));
    if (unique.size) {
      const { error: e } = await db.from("product_references").insert([...unique.values()].map((r) => ({ ...r, product_id: id })));
      if (e) throw new Error(friendlyDbError(e.message));
    }
  }
  if (input.images) {
    await db.from("product_images").delete().eq("product_id", id);
    if (input.images.length) {
      await db.from("product_images").insert(input.images.map((img, i) => ({ product_id: id, url: img.url, alt: img.alt || input.name, sort: i })));
    }
  }
  if (input.fitments) {
    await db.from("product_fitments").delete().eq("product_id", id);
    const unique = new Map(input.fitments.map((f) => [f.version_id, f]));
    if (unique.size) {
      const { error: e } = await db.from("product_fitments").insert(
        [...unique.values()].map((f) => ({
          ...f,
          product_id: id,
          verified_by: ctx.profile.id,
          source: ctx.source === "admin_ai" ? "Asistente (confirmado por usuario)" : ctx.source === "import" ? "Importación" : "Panel",
        })),
      );
      if (e) throw new Error(friendlyDbError(e.message));
    }
  }
  if (input.relations) {
    await db.from("product_relations").delete().eq("product_id", id);
    const rel = input.relations.filter((r) => r.related_id !== id);
    if (rel.length) await db.from("product_relations").insert(rel.map((r) => ({ ...r, product_id: id })));
  }

  if (!input.id && input.initial_stock && input.initial_stock > 0) {
    const { error: e } = await db.rpc("adjust_stock", {
      p_product_id: id,
      p_delta: input.initial_stock,
      p_type: "initial",
      p_reason: "Stock inicial al crear el producto",
      p_source: ctx.source,
    });
    if (e) throw new Error(friendlyDbError(e.message));
  }

  await audit(ctx, input.id ? "product.update" : "product.create", "product", id, before, row);
  return { id, slug: saved.slug as string };
}

export async function setProductsStatus(ctx: ServiceCtx, ids: string[], status: "draft" | "published" | "archived") {
  ensure(ctx, "products.write");
  if (status === "published") ensure(ctx, "products.publish");
  if (!ids.length) return { updated: 0 };
  if (status === "published") {
    const { data: noPrice } = await ctx.supabase.from("products").select("sku").in("id", ids).lte("price", 0);
    if (noPrice?.length) throw new Error(`Sin precio: ${noPrice.map((p) => p.sku).join(", ")}`);
  }
  const { data, error } = await ctx.supabase.from("products").update({ status }).in("id", ids).select("id, sku");
  if (error) throw new Error(friendlyDbError(error.message));
  await audit(ctx, "product.status", "product", null, null, { status, ids, skus: (data ?? []).map((d) => d.sku) });
  return { updated: data?.length ?? 0 };
}

/** Ajuste de precios en lote por porcentaje, con redondeo a múltiplos de 500 Gs. */
export async function bulkPriceChange(ctx: ServiceCtx, ids: string[], percent: number, rounding = 500) {
  ensure(ctx, "prices.write");
  if (!ids.length) throw new Error("No hay productos seleccionados.");
  if (!Number.isFinite(percent) || percent === 0 || percent < -90 || percent > 300) throw new Error("Porcentaje inválido.");
  const { data: rows, error } = await ctx.supabase.from("products").select("id, sku, price").in("id", ids);
  if (error) throw new Error(friendlyDbError(error.message));
  const changes = (rows ?? []).map((r) => {
    const next = Math.max(rounding, Math.round((r.price * (1 + percent / 100)) / rounding) * rounding);
    return { id: r.id as string, sku: r.sku as string, before: r.price as number, after: next };
  });
  for (const c of changes) {
    const { error: e } = await ctx.supabase.from("products").update({ price: c.after }).eq("id", c.id);
    if (e) throw new Error(friendlyDbError(e.message));
  }
  await audit(ctx, "product.bulk_price", "product", null, null, { percent, changes });
  return { updated: changes.length, changes };
}

export async function previewBulkPrice(ctx: ServiceCtx, ids: string[], percent: number, rounding = 500) {
  ensure(ctx, "products.read");
  const { data } = await ctx.supabase.from("products").select("id, sku, name, price").in("id", ids);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    sku: r.sku as string,
    name: r.name as string,
    before: r.price as number,
    after: Math.max(rounding, Math.round((r.price * (1 + percent / 100)) / rounding) * rounding),
  }));
}

export async function duplicateProduct(ctx: ServiceCtx, id: string) {
  ensure(ctx, "products.write");
  const { data: p } = await ctx.supabase
    .from("products")
    .select("*, product_references(kind, code, brand), product_images(url, alt, sort), product_fitments(version_id, status, notes)")
    .eq("id", id)
    .single();
  if (!p) throw new Error("Producto no encontrado.");
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return saveProduct(ctx, {
    ...p,
    id: undefined,
    sku: `${p.sku}-C${suffix}`,
    slug: undefined,
    name: `${p.name} (copia)`,
    status: "draft",
    images: (p.product_images ?? []).sort((a: { sort: number }, b: { sort: number }) => a.sort - b.sort),
    fitments: p.product_fitments ?? [],
  });
}

/** Mejora de texto: sólo actualiza descripciones (no precios ni stock). */
export async function updateDescriptions(ctx: ServiceCtx, updates: { id: string; short_description?: string; description?: string }[]) {
  ensure(ctx, "products.write");
  const done: string[] = [];
  for (const u of updates) {
    const { data: before } = await ctx.supabase.from("products").select("sku, short_description, description").eq("id", u.id).single();
    const patch: Record<string, string> = {};
    if (u.short_description) patch.short_description = u.short_description.slice(0, 300);
    if (u.description) patch.description = u.description.slice(0, 6000);
    const { error } = await ctx.supabase.from("products").update(patch).eq("id", u.id);
    if (error) throw new Error(friendlyDbError(error.message));
    await audit(ctx, "product.descriptions", "product", u.id, before, patch);
    done.push(before?.sku ?? u.id);
  }
  return { updated: done };
}
