import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

// Libera reservas de pedidos no pagados a tiempo. Programado en vercel.json.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { data, error } = await createServiceClient().rpc("expire_pending_orders");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expired: data });
}
