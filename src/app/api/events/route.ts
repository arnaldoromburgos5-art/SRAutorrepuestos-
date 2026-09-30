import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/admin";

const schema = z.object({
  type: z.enum(["page_view", "product_view", "search", "add_to_cart", "begin_checkout", "purchase", "chat_open"]),
  session_id: z.string().min(8).max(64),
  product_id: z.string().uuid().optional(),
  query: z.string().max(120).optional(),
  results_count: z.number().int().min(0).max(100000).optional(),
  value: z.number().int().min(0).max(1e12).optional(),
});

// Registro de eventos de navegación para conversión, abandono de carrito y búsquedas sin resultados.
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  if (!(await rateLimit(`events:${await clientIp()}`, 240, 60))) return new NextResponse(null, { status: 204 });
  const { user } = await getSession();
  await createServiceClient().from("analytics_events").insert({ ...parsed.data, user_id: user?.id ?? null });
  return new NextResponse(null, { status: 204 });
}
