import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { orderSchema, QUOTE_ERROR_MESSAGES } from "@/lib/checkout";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/admin";
import { startPayment } from "@/lib/payments";

export async function POST(request: Request) {
  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;
  if (input.delivery_method !== "pickup" && (!input.shipping_address || !input.shipping_zone_id)) {
    return NextResponse.json({ error: "Completá la dirección y la zona de envío." }, { status: 400 });
  }
  if (input.invoice_requested && (!input.document_number || (input.document_type === "RUC" && !input.business_name))) {
    return NextResponse.json({ error: "Para la factura necesitamos el RUC/CI y la razón social." }, { status: 400 });
  }
  if (!(await rateLimit(`order:${await clientIp()}`, 10, 600))) {
    return NextResponse.json({ error: "Demasiados intentos. Esperá unos minutos." }, { status: 429 });
  }

  const { supabase, user } = await getSession();
  const db = createServiceClient();
  // El user_id sale de la sesión, nunca del cuerpo de la solicitud.
  const { data, error } = await db.rpc("create_order", { p: { ...input, user_id: user?.id ?? null } });
  if (error) {
    const stock = error.message.startsWith("INSUFFICIENT_STOCK");
    return NextResponse.json(
      { error: stock ? "Otro cliente acaba de comprar el último stock de un producto. Revisá tu carrito." : "No pudimos crear el pedido." },
      { status: stock ? 409 : 500 },
    );
  }
  const result = data as { ok: boolean; errors?: { code: string; message?: string }[]; order_id?: string; access_token?: string; number?: number; total?: number };
  if (!result.ok) {
    const first = result.errors?.[0];
    return NextResponse.json(
      { error: first?.message ?? QUOTE_ERROR_MESSAGES[first?.code ?? ""] ?? "Revisá tu carrito.", errors: result.errors },
      { status: 409 },
    );
  }

  if (user && input.save_address && input.shipping_address) {
    await supabase.from("addresses").insert({ user_id: user.id, label: "Checkout", ...input.shipping_address });
  }
  try {
    await startPayment({ id: result.order_id!, number: result.number!, total: result.total!, access_token: result.access_token!, status: "pending_payment" });
  } catch (e) {
    console.error("startPayment", e);
    // El pedido queda reservado; el cliente puede reintentar el pago desde la página del pedido.
  }
  return NextResponse.json({ orderId: result.order_id, token: result.access_token, number: result.number });
}
