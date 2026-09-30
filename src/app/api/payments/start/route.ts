import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrderForCustomer } from "@/lib/orders";
import { startPayment } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Reintento de pago para un pedido pendiente.
export async function POST(request: Request) {
  const body = z.object({ orderId: z.string().uuid(), token: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  if (!(await rateLimit(`pay-start:${await clientIp()}`, 15, 600))) return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  const order = await getOrderForCustomer(body.data.orderId, body.data.token);
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  if (order.status !== "pending_payment") return NextResponse.json({ error: "El pedido ya no está pendiente de pago." }, { status: 409 });
  try {
    const start = await startPayment(order);
    return NextResponse.json(start);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo iniciar el pago. Probá nuevamente." }, { status: 502 });
  }
}
