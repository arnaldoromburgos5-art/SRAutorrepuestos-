import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "@/lib/env";
import type { AnyClient } from "./types";

let cached: AnyClient | null = null;

/**
 * Cliente con service role: ignora RLS. Usar sólo para operaciones de sistema
 * (crear pedidos vía RPC, confirmar pagos, registrar eventos, límites de uso).
 * Nunca lo uses para ejecutar acciones pedidas por un administrador: esas van con su sesión.
 */
export function createServiceClient(): AnyClient {
  cached ??= createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as AnyClient;
  return cached;
}
