import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { orderNumber } from "@/lib/utils";
import { bancardSingleBuy, bancardCheckoutScriptUrl } from "./bancard";

export type PaymentProviderName = "mock" | "bancard";

export function paymentProvider(): PaymentProviderName {
  return process.env.PAYMENT_PROVIDER === "bancard" ? "bancard" : "mock";
}

export type PaymentStart =
  | { provider: "mock"; paymentId: string }
  | { provider: "bancard"; paymentId: string; processId: string; scriptUrl: string };

type OrderForPayment = { id: string; number: number; total: number; access_token: string; status: string };

/**
 * Crea un intento de pago para el pedido. El monto sale siempre del pedido guardado en la base,
 * nunca del navegador. La confirmación llega luego por webhook (confirm_payment).
 */
export async function startPayment(order: OrderForPayment): Promise<PaymentStart> {
  if (order.status !== "pending_payment") throw new Error("El pedido no está pendiente de pago.");
  const provider = paymentProvider();
  const db = createServiceClient();
  const { data: payment, error } = await db
    .from("payments")
    .insert({ order_id: order.id, provider, amount: order.total, currency: "PYG" })
    .select("id, shop_process_id")
    .single();
  if (error || !payment) throw new Error(error?.message ?? "No se pudo iniciar el pago.");

  if (provider === "mock") return { provider, paymentId: payment.id };

  const back = `${siteUrl()}/pedido/${order.id}?t=${order.access_token}`;
  const processId = await bancardSingleBuy({
    shopProcessId: Number(payment.shop_process_id),
    amount: order.total,
    description: `Pedido ${orderNumber(order.number)}`,
    returnUrl: back,
    cancelUrl: `${siteUrl()}/pago/${order.id}?t=${order.access_token}&cancelado=1`,
  });
  await db.from("payments").update({ provider_ref: processId }).eq("id", payment.id);
  return { provider, paymentId: payment.id, processId, scriptUrl: bancardCheckoutScriptUrl() };
}
