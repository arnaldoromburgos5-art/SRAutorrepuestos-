import "server-only";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";

export type OrderView = {
  id: string;
  number: number;
  status: "pending_payment" | "paid" | "preparing" | "shipped" | "delivered" | "cancelled";
  access_token: string;
  user_id: string | null;
  customer_name: string;
  email: string;
  phone: string;
  delivery_method: "pickup" | "home" | "agency";
  shipping_address: { recipient: string; phone: string; department: string; city: string; street: string; reference?: string } | null;
  subtotal: number;
  discount_total: number;
  shipping_cost: number;
  tax_total: number;
  total: number;
  coupon_code: string | null;
  tracking_code: string | null;
  carrier: string | null;
  reservation_expires_at: string | null;
  paid_at: string | null;
  created_at: string;
  cancel_reason: string | null;
  invoice_requested: boolean;
  items: { id: string; name: string; sku: string; brand_name: string | null; image_url: string | null; unit_price: number; quantity: number; line_total: number; discount: number; product_id: string | null }[];
  history: { to_status: string; note: string | null; created_at: string }[];
  payments: { id: string; provider: string; status: string; provider_ref: string | null; created_at: string; response_description: string | null }[];
};

/**
 * Carga un pedido para mostrarlo al comprador: se exige el token de acceso del pedido
 * (compras como invitado) o que el pedido pertenezca al usuario autenticado.
 */
export async function getOrderForCustomer(orderId: string, token: string | undefined | null): Promise<OrderView | null> {
  if (!z.string().uuid().safeParse(orderId).success) return null;
  const { data } = await createServiceClient()
    .from("orders")
    .select("*, items:order_items(*), history:order_status_history(to_status, note, created_at), payments(id, provider, status, provider_ref, created_at, response_description)")
    .eq("id", orderId)
    .maybeSingle();
  if (!data) return null;
  const order = data as unknown as OrderView;
  const tokenOk = !!token && token === order.access_token;
  if (!tokenOk) {
    const { user } = await getSession();
    if (!user || user.id !== order.user_id) return null;
  }
  order.history.sort((a, b) => a.created_at.localeCompare(b.created_at));
  order.payments.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return order;
}
