import "server-only";
import { z } from "zod";
import { friendlyDbError } from "@/lib/utils";
import { paraguayDay } from "@/lib/periods";
import { audit, ensure, type ServiceCtx } from "./context";

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------
export async function adjustStock(ctx: ServiceCtx, input: { product_id: string; delta: number; type: "purchase_in" | "adjustment" | "initial"; reason: string }) {
  ensure(ctx, "inventory.adjust");
  const parsed = z
    .object({ product_id: z.string().uuid(), delta: z.number().int().refine((n) => n !== 0, "La cantidad no puede ser 0"), type: z.enum(["purchase_in", "adjustment", "initial"]), reason: z.string().trim().min(3, "Indicá el motivo").max(300) })
    .parse(input);
  const { data, error } = await ctx.supabase.rpc("adjust_stock", {
    p_product_id: parsed.product_id,
    p_delta: parsed.delta,
    p_type: parsed.type,
    p_reason: parsed.reason,
    p_source: ctx.source,
  });
  if (error) throw new Error(friendlyDbError(error.message));
  return data as { on_hand: number; reserved: number };
}

export async function lowStock(ctx: ServiceCtx, limit = 100) {
  ensure(ctx, "inventory.read");
  const { data, error } = await ctx.supabase.rpc("low_stock", { p_limit: limit });
  if (error) throw new Error(friendlyDbError(error.message));
  return (data ?? []) as { product_id: string; sku: string; name: string; status: string; on_hand: number; reserved: number; available: number; min_stock: number; brand_name: string | null }[];
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------
export async function setOrderStatus(ctx: ServiceCtx, input: { order_id: string; status: "preparing" | "shipped" | "delivered"; note?: string; tracking?: string; carrier?: string }) {
  ensure(ctx, "orders.manage");
  const { error } = await ctx.supabase.rpc("set_order_status", {
    p_order_id: input.order_id,
    p_status: input.status,
    p_note: input.note || null,
    p_tracking: input.tracking || null,
    p_carrier: input.carrier || null,
    p_source: ctx.source,
  });
  if (error) throw new Error(friendlyDbError(error.message));
}

export async function cancelOrder(ctx: ServiceCtx, orderId: string, reason: string) {
  ensure(ctx, "orders.manage");
  const { error } = await ctx.supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: reason, p_source: ctx.source });
  if (error) throw new Error(friendlyDbError(error.message));
}

export async function registerReturn(
  ctx: ServiceCtx,
  input: { order_id: string; items: { order_item_id: string; quantity: number }[]; reason: string; restock: boolean; refund: number },
) {
  ensure(ctx, "orders.manage");
  const { error } = await ctx.supabase.rpc("register_return", {
    p_order_id: input.order_id,
    p_items: input.items,
    p_reason: input.reason,
    p_restock: input.restock,
    p_refund: input.refund,
    p_source: ctx.source,
  });
  if (error) throw new Error(friendlyDbError(error.message));
}

export async function resolveAttention(ctx: ServiceCtx, orderId: string) {
  ensure(ctx, "orders.manage");
  const { error } = await ctx.supabase.from("orders").update({ needs_attention: false }).eq("id", orderId);
  if (error) throw new Error(friendlyDbError(error.message));
  await audit(ctx, "order.attention_resolved", "order", orderId, null, null);
}

// ---------------------------------------------------------------------------
// Promociones
// ---------------------------------------------------------------------------
export const promotionSchema = z.object({
  name: z.string().trim().min(3).max(80),
  percent: z.number().min(1).max(90),
  scope: z.enum(["all", "category", "brand", "products"]),
  category_id: z.string().uuid().optional().nullable(),
  brand_id: z.string().uuid().optional().nullable(),
  product_ids: z.array(z.string().uuid()).default([]),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

export async function createPromotion(ctx: ServiceCtx, raw: unknown) {
  ensure(ctx, "promotions.manage");
  const p = promotionSchema.parse(raw);
  if (p.scope === "category" && !p.category_id) throw new Error("Elegí la categoría.");
  if (p.scope === "brand" && !p.brand_id) throw new Error("Elegí la marca.");
  if (p.scope === "products" && !p.product_ids.length) throw new Error("Elegí los productos.");
  const row = { ...p, starts_at: paraguayDay(p.starts_at, "start") ?? new Date().toISOString(), ends_at: paraguayDay(p.ends_at, "end"), created_by: ctx.profile.id };
  const { data, error } = await ctx.supabase.from("promotions").insert(row).select("id").single();
  if (error) throw new Error(friendlyDbError(error.message));
  await audit(ctx, "promotion.create", "promotion", data.id, null, row);
  return { id: data.id as string };
}

export const couponSchema = z.object({
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "Sólo letras, números, - y _"),
  description: z.string().trim().max(160).optional().nullable(),
  type: z.enum(["percent", "fixed"]),
  value: z.number().positive(),
  min_subtotal: z.number().int().min(0).default(0),
  max_discount: z.number().int().positive().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  brand_id: z.string().uuid().optional().nullable(),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
  usage_limit: z.number().int().positive().optional().nullable(),
  per_customer_limit: z.number().int().positive().optional().nullable(),
});

export async function createCoupon(ctx: ServiceCtx, raw: unknown) {
  ensure(ctx, "promotions.manage");
  const c = couponSchema.parse(raw);
  if (c.type === "percent" && c.value > 90) throw new Error("El porcentaje máximo es 90 %.");
  const row = { ...c, code: c.code.toUpperCase(), starts_at: paraguayDay(c.starts_at, "start"), ends_at: paraguayDay(c.ends_at, "end") };
  const { data, error } = await ctx.supabase.from("coupons").insert(row).select("id").single();
  if (error) throw new Error(friendlyDbError(error.message));
  await audit(ctx, "coupon.create", "coupon", data.id, null, row);
  return { id: data.id as string };
}

// ---------------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------------
export type DashboardMetrics = {
  revenue: number; orders: number; avg_ticket: number; units: number; discounts: number; margin: number; margin_coverage: number;
  new_customers: number; returning_customers: number; cancelled_paid: number; cancelled_unpaid: number; returns: number; refunds: number;
  pending_fulfillment: number; pending_payment: number; needs_attention: number; low_stock: number;
  sessions: number; sessions_with_cart: number; sessions_with_purchase: number;
  top_products: { product_id: string; name: string; sku: string; units: number; revenue: number }[];
  top_categories: { name: string; units: number; revenue: number }[];
  by_day: { day: string; revenue: number; orders: number }[];
};

export async function dashboardMetrics(ctx: ServiceCtx, from: Date, to: Date) {
  ensure(ctx, "analytics.read");
  const { data, error } = await ctx.supabase.rpc("dashboard_metrics", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(friendlyDbError(error.message));
  return data as DashboardMetrics;
}

export async function compareSales(ctx: ServiceCtx, a: { from: Date; to: Date }, b: { from: Date; to: Date }) {
  const [ma, mb] = await Promise.all([dashboardMetrics(ctx, a.from, a.to), dashboardMetrics(ctx, b.from, b.to)]);
  const pick = (m: DashboardMetrics) => ({ revenue: m.revenue, orders: m.orders, avg_ticket: m.avg_ticket, units: m.units, margin: m.margin, new_customers: m.new_customers });
  const pa = pick(ma);
  const pb = pick(mb);
  const change = Object.fromEntries(
    Object.keys(pa).map((k) => {
      const x = pa[k as keyof typeof pa];
      const y = pb[k as keyof typeof pb];
      return [k, y ? Math.round(((x - y) / y) * 1000) / 10 : null];
    }),
  );
  return { period_a: pa, period_b: pb, change_percent: change, top_products_a: ma.top_products.slice(0, 5), top_products_b: mb.top_products.slice(0, 5) };
}

export type Insights = {
  searches_without_results: { query: string; times: number; last_seen: string }[];
  low_rotation: { id: string; sku: string; name: string; on_hand: number; stock_value: number }[];
  reorder_suggestions: { id: string; sku: string; name: string; available: number; min_stock: number; daily_sales: number; lead_days: number; suggested_qty: number }[];
  chatbot: { conversations: number; handoffs: number; assisted_orders: number; assisted_paid_orders: number; assisted_revenue: number };
};

export async function managementInsights(ctx: ServiceCtx, days = 60) {
  ensure(ctx, "analytics.read");
  const { data, error } = await ctx.supabase.rpc("management_insights", { p_days: days });
  if (error) throw new Error(friendlyDbError(error.message));
  return data as Insights;
}
