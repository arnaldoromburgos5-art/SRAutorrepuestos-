import { NextResponse } from "next/server";
import { z } from "zod";
import { paymentProvider } from "@/lib/payments";
import { createServiceClient } from "@/lib/supabase/admin";

// Simulador de pasarela para desarrollo y pruebas. Sólo funciona con PAYMENT_PROVIDER=mock.
export async function POST(request: Request) {
  if (paymentProvider() !== "mock") return NextResponse.json({ error: "No disponible" }, { status: 404 });
  const body = z
    .object({ paymentId: z.string().uuid(), token: z.string().uuid(), approve: z.boolean() })
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const db = createServiceClient();
  const { data: payment } = await db
    .from("payments")
    .select("id, amount, currency, provider, orders!inner(access_token)")
    .eq("id", body.data.paymentId)
    .maybeSingle();
  const order = payment?.orders as unknown as { access_token: string } | undefined;
  if (!payment || payment.provider !== "mock" || order?.access_token !== body.data.token) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  }

  const { data, error } = await db.rpc("confirm_payment", {
    p_payment_id: payment.id,
    p_event_key: `mock-${payment.id}`,
    p_approved: body.data.approve,
    p_amount: payment.amount,
    p_currency: payment.currency,
    p_authorization: body.data.approve ? `SIM${Date.now().toString().slice(-6)}` : null,
    p_description: body.data.approve ? "Aprobado (simulador)" : "Rechazado (simulador)",
    p_payload: { simulated: true },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
