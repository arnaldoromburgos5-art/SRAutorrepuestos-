import { NextResponse } from "next/server";
import { bancardAmountToPyg, verifyBancardConfirmation, type BancardConfirmation } from "@/lib/payments/bancard";
import { createServiceClient } from "@/lib/supabase/admin";

// Webhook de confirmación de Bancard vPOS. Configurá esta URL en el portal del comercio:
//   https://TU-DOMINIO/api/payments/bancard/confirm
// La confirmación se procesa una sola vez aunque Bancard la reenvíe (payment_events + confirm_payment).
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as BancardConfirmation | null;
  if (!payload?.operation?.shop_process_id) return NextResponse.json({ status: "error" }, { status: 400 });
  if (!verifyBancardConfirmation(payload)) {
    console.warn("Bancard: firma inválida", payload.operation.shop_process_id);
    return NextResponse.json({ status: "error", message: "invalid token" }, { status: 401 });
  }

  const op = payload.operation;
  const db = createServiceClient();
  const { data: payment } = await db.from("payments").select("id").eq("shop_process_id", Number(op.shop_process_id)).maybeSingle();
  if (!payment) return NextResponse.json({ status: "error", message: "unknown payment" }, { status: 404 });

  const approved = op.response === "S" && op.response_code === "00";
  const { error } = await db.rpc("confirm_payment", {
    p_payment_id: payment.id,
    p_event_key: `bancard-${op.shop_process_id}-${op.response}-${op.ticket_number ?? op.authorization_number ?? "na"}`,
    p_approved: approved,
    p_amount: bancardAmountToPyg(op.amount),
    p_currency: op.currency,
    p_authorization: op.authorization_number ?? null,
    p_description: op.response_description ?? op.response_details ?? null,
    p_payload: payload as unknown as Record<string, unknown>,
  });
  if (error) {
    console.error("confirm_payment", error.message);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
  return NextResponse.json({ status: "success" });
}
