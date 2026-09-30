import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { quoteSchema } from "@/lib/checkout";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/admin";

// Cotización del carrito: precios, promociones, cupón, envío e IVA calculados en la base.
export async function POST(request: Request) {
  const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  if (!(await rateLimit(`quote:${await clientIp()}`, 120, 60))) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }
  const { user } = await getSession();
  const { data, error } = await createServiceClient().rpc("price_cart", {
    p: { ...parsed.data, user_id: user?.id ?? null },
  });
  if (error) return NextResponse.json({ error: "No se pudo cotizar el carrito" }, { status: 500 });
  return NextResponse.json(data);
}
