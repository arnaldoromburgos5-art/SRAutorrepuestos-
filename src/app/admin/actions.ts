"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { staffContext, ensure, audit } from "@/lib/services/context";
import { bulkPriceChange, duplicateProduct, saveProduct, setProductsStatus } from "@/lib/services/products";
import { adjustStock, cancelOrder, createCoupon, createPromotion, registerReturn, resolveAttention, setOrderStatus } from "@/lib/services/operations";
import { applyImport, parseImportFile, validateImport, type ValidatedRow } from "@/lib/services/imports";
import { friendlyDbError, type ActionResult } from "@/lib/utils";

async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (e) {
    const err = e as Error;
    if (err.message === "NEXT_REDIRECT" || (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ") };
    return { ok: false, error: friendlyDbError(err.message) };
  }
}

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? undefined : Number(String(v).replace(/[.\s]/g, "")));
const str = (v: FormDataEntryValue | null) => (v === null ? undefined : String(v).trim() || undefined);

// --- Productos -------------------------------------------------------------------
export async function saveProductAction(payload: unknown): Promise<ActionResult<{ id: string; slug: string }>> {
  const res = await run(async () => saveProduct(await staffContext(), payload), "Producto guardado.");
  if (res.ok) {
    revalidatePath("/admin/productos");
    revalidatePath("/catalogo");
  }
  return res;
}

export async function setStatusAction(ids: string[], status: "draft" | "published" | "archived") {
  const res = await run(async () => setProductsStatus(await staffContext(), ids, status), "Estado actualizado.");
  revalidatePath("/admin/productos");
  return res;
}

export async function bulkPriceAction(ids: string[], percent: number) {
  const res = await run(async () => bulkPriceChange(await staffContext(), ids, percent), "Precios actualizados.");
  revalidatePath("/admin/productos");
  return res;
}

export async function duplicateProductAction(id: string) {
  const res = await run(async () => duplicateProduct(await staffContext(), id));
  if (res.ok && res.data) redirect(`/admin/productos/${res.data.id}?duplicado=1`);
  return res;
}

export async function deleteProductAction(id: string) {
  const res = await run(async () => {
    const ctx = await staffContext();
    ensure(ctx, "products.publish");
    const { count } = await ctx.supabase.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", id);
    if (count) throw new Error("El producto tiene ventas registradas: archivalo en lugar de eliminarlo.");
    const { data: before } = await ctx.supabase.from("products").select("sku, name").eq("id", id).single();
    const { error } = await ctx.supabase.from("products").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await audit(ctx, "product.delete", "product", id, before, null);
  });
  if (res.ok) redirect("/admin/productos");
  return res;
}

// --- Importación -------------------------------------------------------------------
export async function validateImportAction(form: FormData): Promise<ActionResult<{ rows: ValidatedRow[]; raw: Record<string, string>[] }>> {
  return run(async () => {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Elegí un archivo.");
    if (file.size > 5 * 1024 * 1024) throw new Error("El archivo supera los 5 MB.");
    const ctx = await staffContext("import");
    const raw = await parseImportFile(file);
    if (!raw.length) throw new Error("El archivo no tiene filas.");
    const rows = await validateImport(ctx, raw);
    return { rows: rows.map(({ payload, ...r }) => ({ ...r, payload: payload ? {} : undefined })), raw };
  });
}

export async function applyImportAction(raw: Record<string, string>[]) {
  const res = await run(async () => applyImport(await staffContext("import"), raw), "Importación finalizada.");
  revalidatePath("/admin/productos");
  return res;
}

// --- Inventario -------------------------------------------------------------------
export async function adjustStockAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const res = await run(async () => {
    const qty = num(form.get("quantity"));
    const direction = form.get("direction") === "out" ? -1 : 1;
    await adjustStock(await staffContext(), {
      product_id: String(form.get("product_id")),
      delta: (qty ?? 0) * direction,
      type: form.get("type") === "purchase_in" ? "purchase_in" : "adjustment",
      reason: String(form.get("reason") ?? ""),
    });
  }, "Stock actualizado.");
  revalidatePath("/admin/inventario");
  return res as ActionResult;
}

export async function updateMinStockAction(productId: string, minStock: number) {
  return run(async () => {
    const ctx = await staffContext();
    ensure(ctx, "inventory.adjust");
    const { error } = await ctx.supabase.from("products").update({ min_stock: Math.max(0, Math.round(minStock)) }).eq("id", productId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/inventario");
  });
}

// --- Pedidos -----------------------------------------------------------------------
export async function orderStatusAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const id = String(form.get("order_id"));
  const res = await run(async () =>
    setOrderStatus(await staffContext(), {
      order_id: id,
      status: String(form.get("status")) as "preparing" | "shipped" | "delivered",
      note: str(form.get("note")),
      tracking: str(form.get("tracking")),
      carrier: str(form.get("carrier")),
    }),
  "Estado actualizado.");
  revalidatePath(`/admin/pedidos/${id}`);
  return res as ActionResult;
}

export async function cancelOrderAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const id = String(form.get("order_id"));
  const res = await run(async () => cancelOrder(await staffContext(), id, String(form.get("reason") ?? "")), "Pedido cancelado.");
  revalidatePath(`/admin/pedidos/${id}`);
  return res as ActionResult;
}

export async function returnAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const id = String(form.get("order_id"));
  const items = [...form.entries()]
    .filter(([k, v]) => k.startsWith("qty_") && Number(v) > 0)
    .map(([k, v]) => ({ order_item_id: k.slice(4), quantity: Number(v) }));
  const res = await run(async () => {
    if (!items.length) throw new Error("Indicá al menos una cantidad a devolver.");
    await registerReturn(await staffContext(), {
      order_id: id,
      items,
      reason: String(form.get("reason") ?? ""),
      restock: form.get("restock") === "on",
      refund: num(form.get("refund")) ?? 0,
    });
  }, "Devolución registrada.");
  revalidatePath(`/admin/pedidos/${id}`);
  return res as ActionResult;
}

export async function resolveAttentionAction(orderId: string) {
  const res = await run(async () => resolveAttention(await staffContext(), orderId));
  revalidatePath(`/admin/pedidos/${orderId}`);
  return res;
}

// --- Clientes ----------------------------------------------------------------------
export async function addCustomerNoteAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const customerId = String(form.get("customer_id"));
  const res = await run(async () => {
    const ctx = await staffContext();
    ensure(ctx, "customers.notes");
    const note = z.string().trim().min(2).max(1000).parse(form.get("note"));
    const { error } = await ctx.supabase.from("customer_notes").insert({ customer_id: customerId, author_id: ctx.profile.id, note });
    if (error) throw new Error(error.message);
  }, "Nota agregada.");
  revalidatePath(`/admin/clientes/${customerId}`);
  return res as ActionResult;
}

export async function setWholesaleAction(customerId: string, value: boolean) {
  const res = await run(async () => {
    const ctx = await staffContext();
    ensure(ctx, "customers.write");
    const { error } = await ctx.supabase.from("profiles").update({ is_wholesale: value }).eq("id", customerId);
    if (error) throw new Error(error.message);
    await audit(ctx, "customer.wholesale", "profile", customerId, null, { is_wholesale: value });
  });
  revalidatePath(`/admin/clientes/${customerId}`);
  return res;
}

// --- Promociones -------------------------------------------------------------------
export async function createPromotionAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const res = await run(async () => {
    await createPromotion(await staffContext(), {
      name: str(form.get("name")),
      percent: num(form.get("percent")),
      scope: str(form.get("scope")),
      category_id: str(form.get("category_id")) ?? null,
      brand_id: str(form.get("brand_id")) ?? null,
      product_ids: [],
      starts_at: str(form.get("starts_at")) ?? null,
      ends_at: str(form.get("ends_at")) ?? null,
    });
  }, "Promoción creada.");
  revalidatePath("/admin/promociones");
  return res as ActionResult;
}

export async function createCouponAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const res = await run(async () => {
    await createCoupon(await staffContext(), {
      code: str(form.get("code")),
      description: str(form.get("description")) ?? null,
      type: str(form.get("type")),
      value: num(form.get("value")),
      min_subtotal: num(form.get("min_subtotal")) ?? 0,
      max_discount: num(form.get("max_discount")) ?? null,
      category_id: str(form.get("category_id")) ?? null,
      starts_at: str(form.get("starts_at")) ?? null,
      ends_at: str(form.get("ends_at")) ?? null,
      usage_limit: num(form.get("usage_limit")) ?? null,
      per_customer_limit: num(form.get("per_customer_limit")) ?? null,
    });
  }, "Cupón creado.");
  revalidatePath("/admin/promociones");
  return res as ActionResult;
}

export async function toggleRecordAction(table: "coupons" | "promotions" | "banners" | "shipping_zones" | "suppliers", id: string, field: "active", value: boolean) {
  const perms = { coupons: "promotions.manage", promotions: "promotions.manage", banners: "content.manage", shipping_zones: "settings.manage", suppliers: "suppliers.manage" } as const;
  const res = await run(async () => {
    const ctx = await staffContext();
    ensure(ctx, perms[table]);
    const { error } = await ctx.supabase.from(table).update({ [field]: value }).eq("id", id);
    if (error) throw new Error(error.message);
    await audit(ctx, `${table}.toggle`, table, id, null, { [field]: value });
  });
  revalidatePath("/admin", "layout");
  return res;
}

export async function deleteRecordAction(table: "coupons" | "promotions" | "banners" | "pages" | "vehicle_versions" | "shipping_zones", id: string) {
  const perms = { coupons: "promotions.manage", promotions: "promotions.manage", banners: "content.manage", pages: "content.manage", vehicle_versions: "vehicles.manage", shipping_zones: "settings.manage" } as const;
  const res = await run(async () => {
    const ctx = await staffContext();
    ensure(ctx, perms[table]);
    const { error } = await ctx.supabase.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    await audit(ctx, `${table}.delete`, table, id, null, null);
  });
  revalidatePath("/admin", "layout");
  return res;
}
