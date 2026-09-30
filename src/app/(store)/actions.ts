"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { friendlyDbError, type ActionResult } from "@/lib/utils";

export async function toggleFavorite(productId: string): Promise<ActionResult<boolean>> {
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, error: "Ingresá para guardar favoritos." };
  if (!z.string().uuid().safeParse(productId).success) return { ok: false, error: "Producto inválido." };
  const { data: existing } = await supabase.from("favorites").select("product_id").eq("user_id", user.id).eq("product_id", productId).maybeSingle();
  const { error } = existing
    ? await supabase.from("favorites").delete().eq("user_id", user.id).eq("product_id", productId)
    : await supabase.from("favorites").insert({ user_id: user.id, product_id: productId });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/cuenta/favoritos");
  return { ok: true, data: !existing };
}

export async function subscribeBackInStock(productId: string, email: string): Promise<ActionResult> {
  const parsed = z.object({ productId: z.string().uuid(), email: z.string().email().max(160) }).safeParse({ productId, email });
  if (!parsed.success) return { ok: false, error: "Revisá el correo ingresado." };
  if (!(await rateLimit(`stock-notify:${await clientIp()}`, 10, 3600))) return { ok: false, error: "Demasiados intentos. Probá más tarde." };
  const { user } = await getSession();
  const { error } = await createServiceClient()
    .from("stock_notifications")
    .upsert({ product_id: productId, email: parsed.data.email.toLowerCase(), user_id: user?.id ?? null }, { onConflict: "product_id,email" });
  if (error) return { ok: false, error: "No pudimos registrar el aviso." };
  return { ok: true };
}
