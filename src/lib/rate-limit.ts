import "server-only";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Devuelve true si la operación está dentro del límite. */
export async function rateLimit(key: string, max: number, windowSeconds: number) {
  const { data, error } = await createServiceClient().rpc("check_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit", error.message);
    return true; // no bloquear a los clientes por un fallo del limitador
  }
  return data === true;
}
